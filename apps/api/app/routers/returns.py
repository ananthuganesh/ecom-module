"""Customer return requests and the admin approval queue."""

from __future__ import annotations

from typing import Any

from bson import ObjectId
from fastapi import APIRouter, HTTPException, Query

from app.deps import AdminUser, CurrentUser, OrdersWriter
from app.documents import Order, ReturnRequest, User
from app.serializers import doc_to_dict
from app.services import returns as returns_svc
from app.services.order_resolve import resolve_order

router = APIRouter(prefix="/api/returns", tags=["returns"])
admin_router = APIRouter(prefix="/api/admin/returns", tags=["admin-returns"])


def _serialize(request: ReturnRequest) -> dict[str, Any]:
    data = doc_to_dict(request)
    data["itemCount"] = sum(int(i.quantity or 0) for i in request.items or [])
    return data


async def _owned_order(order_ref: str, user: User) -> Order:
    order = await resolve_order(order_ref)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if str(order.customerId) != str(user.id) and not getattr(user, "isAdmin", False):
        raise HTTPException(status_code=403, detail="Not authorized")
    return order


# ---------------------------------------------------------------- customer


@router.get("/eligibility/{order_ref}")
async def return_eligibility(order_ref: str, user: CurrentUser):
    """Which items on this order can still be returned, and until when."""
    order = await _owned_order(order_ref, user)
    return await returns_svc.eligibility(order)


@router.post("/{order_ref}", status_code=201)
async def create_return(order_ref: str, body: dict, user: CurrentUser):
    """Raise a return for chosen items."""
    order = await _owned_order(order_ref, user)
    request = await returns_svc.create_request(
        order,
        user=user,
        selections=body.get("items") or [],
        reason=body.get("reason") or "",
        note=body.get("note") or "",
    )
    return _serialize(request)


@router.get("")
async def my_returns(user: CurrentUser):
    rows = (
        await ReturnRequest.find(ReturnRequest.customerId == str(user.id))
        .sort([("createdAt", -1)])
        .limit(100)
        .to_list()
    )
    return {"returns": [_serialize(r) for r in rows]}


# ---------------------------------------------------------------- admin


@admin_router.get("")
async def list_returns(
    _: AdminUser,
    status: str | None = None,
    q: str | None = None,
    page: int = Query(1, ge=1),
    pageSize: int = Query(25, ge=1, le=100),
):
    """The Returns queue. Newest first, oldest-pending are what need action."""
    query: dict[str, Any] = {}
    if status and status.lower() != "all":
        query["status"] = status.strip().lower()
    if q and q.strip():
        needle = q.strip()
        query["$or"] = [
            {"number": {"$regex": needle, "$options": "i"}},
            {"orderNumber": {"$regex": needle, "$options": "i"}},
            {"customerName": {"$regex": needle, "$options": "i"}},
            {"awb": {"$regex": needle, "$options": "i"}},
        ]

    total = await ReturnRequest.find(query).count()
    rows = (
        await ReturnRequest.find(query)
        .sort([("createdAt", -1)])
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .to_list()
    )
    pending = await ReturnRequest.find({"status": "requested"}).count()
    return {
        "returns": [_serialize(r) for r in rows],
        "total": total,
        "page": page,
        "pageSize": pageSize,
        "pages": max(1, -(-total // pageSize)),
        "pendingCount": pending,
    }


async def _get_request(return_id: str) -> ReturnRequest:
    if not ObjectId.is_valid(return_id):
        raise HTTPException(status_code=400, detail="Invalid return id")
    request = await ReturnRequest.get(ObjectId(return_id))
    if not request:
        raise HTTPException(status_code=404, detail="Return not found")
    return request


@admin_router.get("/{return_id}")
async def get_return(return_id: str, _: AdminUser):
    return _serialize(await _get_request(return_id))


@admin_router.post("/{return_id}/approve")
async def approve_return(return_id: str, _: OrdersWriter):
    """Approve and book the Delhivery reverse pickup."""
    request = await _get_request(return_id)
    result = await returns_svc.approve(request)
    return {
        "ok": True,
        "pickupBooked": result["pickupBooked"],
        "pickupError": result.get("pickupError"),
        "return": _serialize(result["request"]),
    }


@admin_router.post("/{return_id}/reject")
async def reject_return(return_id: str, body: dict, _: OrdersWriter):
    request = await _get_request(return_id)
    updated = await returns_svc.reject(request, reason=(body or {}).get("reason") or "")
    return {"ok": True, "return": _serialize(updated)}


@admin_router.post("/{return_id}/received")
async def receive_return(return_id: str, admin: OrdersWriter):
    """Goods are back: posts a SalesReturn and restocks. Refund stays manual."""
    request = await _get_request(return_id)
    result = await returns_svc.mark_received(request, actor_id=str(admin.id))
    return {
        "ok": True,
        "restockedUnits": result["restockedUnits"],
        "restockErrors": result["restockErrors"],
        "refundDue": result["refundDue"],
        "salesReturnId": result["salesReturnId"],
        "return": _serialize(result["request"]),
    }
