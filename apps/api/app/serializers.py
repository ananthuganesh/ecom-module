from typing import Any

from bson import ObjectId

from app.documents import Order, Product, User


def oid_str(value: Any) -> str | None:
    if value is None:
        return None
    return str(value)


def _jsonify(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, list):
        return [_jsonify(v) for v in value]
    if isinstance(value, dict):
        return {k: _jsonify(v) for k, v in value.items()}
    if hasattr(value, "model_dump"):
        return _jsonify(value.model_dump(mode="python"))
    return value


def user_public(user: User, token: str | None = None, stats: dict | None = None) -> dict:
    first = getattr(user, "firstName", None) or None
    last = getattr(user, "lastName", None) or None
    if not first and not last and user.name:
        parts = str(user.name).strip().split()
        if parts:
            first = parts[0]
            last = " ".join(parts[1:]) if len(parts) > 1 else ""
    data = {
        "_id": oid_str(user.id),
        "name": user.name,
        "firstName": first or "",
        "lastName": last or "",
        "email": user.email,
        "isAdmin": user.isAdmin,
        "roleId": getattr(user, "roleId", None),
        "phone": user.phone,
        "addresses": [a.model_dump() for a in (user.addresses or [])],
        "emailSubscribed": bool(getattr(user, "emailSubscribed", False)),
        "whatsappSubscribed": bool(getattr(user, "whatsappSubscribed", False)),
        "hasPassword": bool(user.password),
        "customerUrlId": getattr(user, "customerUrlId", None) or None,
        "createdAt": getattr(user, "createdAt", None),
        "updatedAt": getattr(user, "updatedAt", None),
        "ordersCount": int((stats or {}).get("ordersCount") or 0),
        "amountSpent": float((stats or {}).get("amountSpent") or 0),
    }
    if token is not None:
        data["token"] = token
    return data


def doc_to_dict(doc: Any) -> dict:
    if doc is None:
        return {}
    raw = doc.model_dump(mode="python") if hasattr(doc, "model_dump") else dict(doc)
    data = _jsonify(raw)
    if "id" in data and "_id" not in data:
        data["_id"] = oid_str(data.pop("id"))
    elif hasattr(doc, "id"):
        data["_id"] = oid_str(doc.id)
    data.pop("revision_id", None)
    return data


def product_dict(product: Product, *, admin: bool = False) -> dict:
    """Storefront-safe product payload. Cost fields only when admin=True."""
    data = doc_to_dict(product)
    if admin:
        return data
    pricing = data.get("pricing")
    if isinstance(pricing, dict):
        pricing = dict(pricing)
        pricing.pop("buyingPrice", None)
        pricing.pop("costPrice", None)
        pricing.pop("landedCost", None)
        data["pricing"] = pricing
    return data


def remap_order(
    order: Order,
    product_map: dict[str, Product] | None = None,
    user_map: dict[str, User] | None = None,
) -> dict:
    po = doc_to_dict(order)
    po["user"] = oid_str(order.customerId)
    customer_id = oid_str(order.customerId)
    po["customerId"] = (
        user_public(user_map[customer_id])
        if user_map and customer_id in user_map
        else {"_id": customer_id}
        if customer_id
        else None
    )
    items = []
    enriched_items = []
    for it in order.items or []:
        pid = oid_str(it.productId)
        name = "Product"
        image = None
        product = product_map.get(pid) if product_map and pid else None
        if product:
            name = product.productName or product.product or product.name or "Product"
            image = (product.thumbnails[0] if product.thumbnails else None) or (
                product.variants[0].images[0] if product.variants and product.variants[0].images else None
            )
        items.append(
            {
                "name": name,
                "image": image,
                "qty": it.quantity,
                "price": it.price,
                "color": it.color,
                "size": it.size or "",
                "product": pid,
            }
        )
        item = _jsonify(it.model_dump(mode="python"))
        item["productId"] = (
            product_dict(product)
            if product
            else {"_id": pid, "productId": pid, "productName": "Product", "thumbnails": []}
        )
        enriched_items.append(item)
    po["items"] = enriched_items
    po["orderItems"] = items
    po["totalPrice"] = order.finalPrice
    po["shippingPrice"] = order.deliveryAmount
    po["dtdcEstCost"] = order.dtdcEstCost
    po["isPaid"] = (order.paymentStatus == "paid") or (
        (order.transactionDetails or {}).get("paymentStatus") == "paid"
    )
    po["paymentMethod"] = order.paymentMethod or (order.transactionDetails or {}).get("paymentMethod")
    po["awbCode"] = order.awb
    po["courierName"] = order.courier or ("DTDC" if order.awb else None)
    po["awb"] = order.awb
    po["courier"] = order.courier
    details = order.transactionDetails or {}
    dtdc = details.get("dtdc") if isinstance(details.get("dtdc"), dict) else {}
    po["dtdcServiceType"] = details.get("dtdcServiceType") or dtdc.get("service_type_id")
    po["refundedAmount"] = details.get("refundedAmount") or 0
    po["refunds"] = details.get("refunds") or []
    return po


async def enrich_orders(orders: list[Order]) -> list[dict]:
    customer_ids = {
        ObjectId(str(order.customerId))
        for order in orders
        if order.customerId and ObjectId.is_valid(str(order.customerId))
    }
    product_ids = {
        ObjectId(str(item.productId))
        for order in orders
        for item in (order.items or [])
        if item.productId and ObjectId.is_valid(str(item.productId))
    }
    users = await User.find({"_id": {"$in": list(customer_ids)}}).to_list() if customer_ids else []
    products = await Product.find({"_id": {"$in": list(product_ids)}}).to_list() if product_ids else []
    user_map = {str(user.id): user for user in users}
    product_map = {str(product.id): product for product in products}

    stats_by_id: dict[str, dict] = {}
    if customer_ids:
        try:
            collection = Order.get_pymongo_collection()
            rows = await collection.aggregate(
                [
                    {
                        "$match": {
                            "customerId": {"$in": list(customer_ids)},
                            "status": {"$nin": ["draft", "abandoned", "cancelled"]},
                        }
                    },
                    {
                        "$group": {
                            "_id": "$customerId",
                            "ordersCount": {"$sum": 1},
                            "amountSpent": {
                                "$sum": {
                                    "$cond": [
                                        {
                                            "$in": [
                                                {
                                                    "$toLower": {
                                                        "$ifNull": ["$paymentStatus", ""]
                                                    }
                                                },
                                                ["paid"],
                                            ]
                                        },
                                        {
                                            "$ifNull": [
                                                "$finalPrice",
                                                {"$ifNull": ["$total", 0]},
                                            ]
                                        },
                                        0,
                                    ]
                                }
                            },
                        }
                    },
                ]
            ).to_list(length=None)
            for row in rows:
                stats_by_id[str(row.get("_id"))] = {
                    "ordersCount": int(row.get("ordersCount") or 0),
                    "amountSpent": float(row.get("amountSpent") or 0),
                }
        except Exception:
            stats_by_id = {}

    result = []
    from app.services.dtdc_est_cost import ensure_dtdc_est_cost

    for order in orders:
        try:
            await ensure_dtdc_est_cost(order, save=True)
        except Exception:
            pass
        remapped = remap_order(order, product_map=product_map, user_map=user_map)
        customer = remapped.get("customerId")
        if isinstance(customer, dict) and customer.get("_id"):
            stats = stats_by_id.get(str(customer["_id"])) or {}
            # Re-serialize with stats so ordersCount is accurate on the nested customer
            user = user_map.get(str(customer["_id"]))
            if user:
                remapped["customerId"] = user_public(user, stats=stats)
            else:
                remapped["customerId"] = {
                    **customer,
                    "customerUrlId": customer.get("customerUrlId"),
                    "ordersCount": int(stats.get("ordersCount") or 0),
                    "amountSpent": float(stats.get("amountSpent") or 0),
                }
        result.append(remapped)
    return result
