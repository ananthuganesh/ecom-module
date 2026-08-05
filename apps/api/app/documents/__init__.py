from datetime import datetime
from typing import Any, Optional

from beanie import Document, Indexed
from bson import ObjectId
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from pymongo import IndexModel


def _as_optional_str(value: Any) -> str | None:
    """Atlas docs mix string slugs and ObjectId refs — always expose strings."""
    if value is None:
        return None
    if isinstance(value, ObjectId):
        return str(value)
    return str(value)


class MongoModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True, arbitrary_types_allowed=True, extra="ignore")


class Address(MongoModel):
    name: str = ""
    phone: str = ""
    house: str = ""
    city: str = ""
    state: str = ""
    pincode: str = ""
    country: str = "India"
    isDefault: bool = False


class User(Document):
    model_config = ConfigDict(populate_by_name=True, arbitrary_types_allowed=True, extra="ignore")

    name: str
    firstName: Optional[str] = None
    lastName: Optional[str] = None
    email: Optional[Indexed(str, unique=True)] = None  # type: ignore[valid-type]
    phone: Optional[str] = None
    password: Optional[str] = None
    addresses: list[Address] = Field(default_factory=list)
    cartId: Optional[Any] = None
    # Legacy flags — staff live in `admins` now. Kept for migration / old docs only.
    isAdmin: bool = False
    roleId: Optional[str] = None
    gstin: Optional[str] = None
    stateCode: Optional[str] = None
    emailSubscribed: bool = True
    whatsappSubscribed: bool = True
    # 12-digit public id for admin filters/URLs (separate from Mongo _id)
    customerUrlId: Optional[str] = None
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "users"
        indexes = [
            # Non-unique: imported/guest data has duplicate and null phones.
            IndexModel([("phone", 1)]),
            IndexModel([("customerUrlId", 1)], unique=True, sparse=True),
        ]


class LoginOtp(Document):
    """Hashed 6-digit email OTP for customer passwordless sign-in."""

    model_config = ConfigDict(populate_by_name=True, arbitrary_types_allowed=True, extra="ignore")

    email: Indexed(str, unique=True)  # type: ignore[valid-type]
    codeHash: str
    expiresAt: datetime
    attempts: int = 0
    createdAt: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "login_otps"
        indexes = [
            IndexModel([("expiresAt", 1)], expireAfterSeconds=0),
        ]


class AdminAccount(Document):
    """Staff / admin panel accounts — separate from storefront customers (`users`)."""

    model_config = ConfigDict(populate_by_name=True, arbitrary_types_allowed=True, extra="ignore")

    name: str
    email: Optional[Indexed(str, unique=True)] = None  # type: ignore[valid-type]
    phone: Optional[str] = None
    password: Optional[str] = None
    # True = owner / full Admin role (wildcard permissions)
    isAdmin: bool = False
    roleId: Optional[str] = None
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "admins"
        indexes = [
            IndexModel([("email", 1)], unique=True, sparse=True),
            IndexModel([("roleId", 1)]),
        ]


class Pricing(MongoModel):
    buyingPrice: Optional[float] = None
    mrp: Optional[float] = None
    sellingPrice: Optional[float] = None
    offerPrice: Optional[float] = None


class Variant(MongoModel):
    color: str = ""
    size: str = ""
    customName: str = ""  # e.g. Material, Style
    customValue: str = ""
    quantity: int = 0
    sku: Optional[str] = None
    barcode: Optional[str] = None
    images: list[str] = Field(default_factory=list)


class TaxClass(Document):
    name: str
    rate: float = 0
    description: Optional[str] = None
    isActive: bool = True
    isDefault: bool = False
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "taxclasses"


class Product(Document):
    model_config = ConfigDict(populate_by_name=True, arbitrary_types_allowed=True, extra="ignore")

    productId: Optional[str] = None
    # 12-digit public id used in admin URLs
    productUrlId: Optional[str] = None
    product: Optional[str] = None
    productName: Optional[str] = None
    name: Optional[str] = None
    slug: Optional[str] = None
    category: Optional[str] = None
    type: Optional[str] = None
    brand: Optional[str] = None
    description: Optional[str] = None
    stone: Optional[str] = None
    gender: Optional[str] = None
    # Apparel attributes (product-level filters / PDP specs)
    fit: Optional[str] = None
    fabric: Optional[str] = None
    neckType: Optional[str] = None
    color: Optional[str] = None  # legacy single color
    colors: list[str] = Field(default_factory=list)
    pattern: Optional[str] = None
    sleeveType: Optional[str] = None
    pricing: Optional[Pricing] = None
    price: Optional[float] = None
    variants: list[Variant] = Field(default_factory=list)
    thumbnails: list[str] = Field(default_factory=list)
    totalStock: int = 0
    status: str = "active"
    # Storefront card badge: new_arrival | trending | best_seller
    badge: Optional[str] = None
    hsnCode: Optional[str] = None
    taxClassId: Optional[str] = None
    priceTaxMode: Optional[str] = "inclusive"
    lowStockThreshold: Optional[int] = None
    metaTitle: Optional[str] = None
    metaDescription: Optional[str] = None
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)

    @field_validator(
        "category",
        "type",
        "brand",
        "productId",
        "productUrlId",
        "slug",
        "stone",
        "gender",
        "fit",
        "fabric",
        "neckType",
        "color",
        "pattern",
        "sleeveType",
        "taxClassId",
        "hsnCode",
        mode="before",
    )
    @classmethod
    def coerce_id_fields(cls, value: Any) -> str | None:
        return _as_optional_str(value)

    @model_validator(mode="before")
    @classmethod
    def map_legacy_subcategory(cls, data: Any) -> Any:
        if isinstance(data, dict):
            out = dict(data)
            if not out.get("type") and out.get("subcategory") is not None:
                out["type"] = out.get("subcategory")
            out.pop("subcategory", None)
            # Normalize colors[] from colors or legacy color
            raw_colors = out.get("colors")
            colors: list[str] = []
            if isinstance(raw_colors, list):
                for item in raw_colors:
                    name = " ".join(str(item or "").strip().split())
                    if name and name.lower() not in {c.lower() for c in colors}:
                        colors.append(name)
            legacy = " ".join(str(out.get("color") or "").strip().split())
            if legacy and legacy.lower() not in {c.lower() for c in colors}:
                colors.insert(0, legacy)
            out["colors"] = colors
            out["color"] = colors[0] if colors else None
            return out
        return data

    @field_validator("totalStock", mode="before")
    @classmethod
    def coerce_stock(cls, value: Any) -> int:
        try:
            return int(value or 0)
        except (TypeError, ValueError):
            return 0

    class Settings:
        name = "products"
        indexes = [
            IndexModel([("slug", 1)], sparse=True),
            IndexModel([("productUrlId", 1)], unique=True, sparse=True),
            IndexModel([("createdAt", -1)]),
        ]


class OrderItem(MongoModel):
    productId: Optional[Any] = None
    productName: Optional[str] = None
    image: Optional[str] = None
    color: str = ""
    size: str = ""
    quantity: int = 1
    price: float = 0


class Order(Document):
    model_config = ConfigDict(populate_by_name=True, arbitrary_types_allowed=True, extra="ignore")

    customerId: Optional[Any] = None
    cartId: Optional[Any] = None
    orderNumber: Optional[str] = None
    # 12-digit public id used in admin URLs (separate from display orderNumber like UA1000)
    orderUrlId: Optional[str] = None
    items: list[OrderItem] = Field(default_factory=list)
    shippingAddress: dict = Field(default_factory=dict)
    status: str = "order placed"
    total: float = 0
    discount: float = 0
    discountAmount: float = 0
    finalPrice: float = 0
    deliveryAmount: float = 0
    # DTDC Surface 7D estimated courier cost (admin Est. Cost) — not customer deliveryAmount
    dtdcEstCost: Optional[float] = None
    isGift: bool = False
    giftFee: float = 0
    giftMessage: str = ""
    couponCode: Optional[str] = None
    paymentMethod: Optional[str] = "razorpay"
    paymentStatus: Optional[str] = None
    transactionDetails: dict = Field(default_factory=dict)
    razorpayOrderId: Optional[str] = None
    razorpayPaymentId: Optional[str] = None
    awb: Optional[str] = None
    courier: Optional[str] = None
    shippingStatus: Optional[str] = None
    invoiceId: Optional[str] = None
    invoiceNumber: Optional[str] = None
    isDelivered: bool = False
    deliveredAt: Optional[datetime] = None
    deliveryDate: Optional[datetime] = None
    archived: bool = False
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)
    attribution: Optional[dict] = None

    @field_validator("paymentMethod", "paymentStatus", "status", "couponCode", mode="before")
    @classmethod
    def coerce_optional_str(cls, value: Any) -> str | None:
        return _as_optional_str(value)

    @field_validator("finalPrice", "total", "discount", "discountAmount", "deliveryAmount", "giftFee", mode="before")
    @classmethod
    def coerce_float(cls, value: Any) -> float:
        try:
            return float(value or 0)
        except (TypeError, ValueError):
            return 0.0

    class Settings:
        name = "orders"
        indexes = [
            IndexModel([("customerId", 1), ("createdAt", -1)]),
            IndexModel([("status", 1), ("createdAt", -1)]),
            IndexModel([("razorpayOrderId", 1)], sparse=True),
            IndexModel([("orderNumber", 1)], unique=True, sparse=True),
            IndexModel([("orderUrlId", 1)], unique=True, sparse=True),
            IndexModel([("createdAt", -1)]),
        ]


class Category(Document):
    name: str
    slug: Optional[str] = None
    parent: Optional[Any] = None
    description: Optional[str] = None
    isActive: bool = True

    class Settings:
        name = "categories"


class Brand(Document):
    name: str
    slug: Optional[str] = None
    description: Optional[str] = None
    isActive: bool = True

    class Settings:
        name = "brands"


class Coupon(Document):
    name: Optional[str] = None
    code: Indexed(str, unique=True)  # type: ignore[valid-type]
    # order | products | bxgy
    kind: str = "order"
    # percentage | fixed
    discountType: str = "percentage"
    discountValue: float = 0
    minOrderAmount: float = 0
    maxDiscount: Optional[float] = None
    usageLimit: Optional[int] = None
    usedCount: int = 0
    expiryDate: Optional[datetime] = None
    status: str = "active"
    # Amount off products — target specific products
    productIds: list[str] = Field(default_factory=list)
    # Buy X get Y
    buyQuantity: int = 1
    getQuantity: int = 1
    getDiscountPercent: float = 100.0
    buyProductIds: list[str] = Field(default_factory=list)
    getProductIds: list[str] = Field(default_factory=list)

    class Settings:
        name = "coupons"


class Warehouse(Document):
    name: str
    code: Indexed(str, unique=True)  # type: ignore[valid-type]
    addressLine1: Optional[str] = None
    city: Optional[str] = None
    stateName: Optional[str] = None
    stateCode: Optional[str] = None
    pincode: Optional[str] = None
    isDefault: bool = False
    isActive: bool = True
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "warehouses"


class StockBalance(Document):
    productId: str
    warehouseId: str
    variantSku: str = ""
    quantity: int = 0
    reserved: int = 0
    updatedAt: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "stockbalances"
        indexes = [
            IndexModel(
                [("productId", 1), ("warehouseId", 1), ("variantSku", 1)],
                unique=True,
            ),
        ]


class StockMovement(Document):
    productId: str
    warehouseId: str
    variantSku: str = ""
    quantity: int = 0  # signed
    type: str = "adjustment"
    reason: Optional[str] = None
    referenceType: Optional[str] = None
    referenceId: Optional[str] = None
    balanceAfter: int = 0
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    createdBy: Optional[str] = None

    class Settings:
        name = "stockmovements"
        indexes = [
            IndexModel([("createdAt", -1)]),
            IndexModel([("productId", 1), ("createdAt", -1)]),
            IndexModel([("warehouseId", 1), ("createdAt", -1)]),
        ]


class AbandonedCheckout(Document):
    userId: Optional[Any] = None
    guestId: Optional[str] = None
    items: list[dict] = Field(default_factory=list)
    totalAmount: float = 0
    customerDetails: dict = Field(default_factory=dict)
    status: str = "abandoned"
    orderId: Optional[Any] = None
    lastActivityAt: datetime = Field(default_factory=datetime.utcnow)
    recoveryToken: Optional[str] = None
    recoveryTokenExpiresAt: Optional[datetime] = None
    recoverySentAt: Optional[datetime] = None
    recoveryLastResult: Optional[dict] = None
    recoveredAt: Optional[datetime] = None

    class Settings:
        name = "abandonedcheckouts"
        indexes = [
            IndexModel([("userId", 1), ("status", 1)]),
            IndexModel([("guestId", 1), ("status", 1)]),
            IndexModel([("lastActivityAt", -1)]),
            IndexModel([("recoveryToken", 1)], unique=True, sparse=True),
        ]


class Setting(Document):
    key: Indexed(str, unique=True)  # type: ignore[valid-type]
    value: Any = None

    class Settings:
        name = "settings"


class PaymentTransaction(Document):
    orderId: Any
    userId: Any
    razorpayOrderId: Optional[str] = None
    razorpayPaymentId: Optional[str] = None
    amountInPaise: int = 0
    currency: str = "INR"
    status: str = "created"
    webhookPayload: Optional[dict] = None
    failureReason: Optional[str] = None
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "paymenttransactions"
        indexes = [
            IndexModel([("razorpayOrderId", 1)], unique=True, sparse=True),
            IndexModel([("orderId", 1), ("status", 1)]),
        ]


class LineItem(MongoModel):
    productId: Optional[str] = None
    productName: str = ""
    variantSku: str = ""
    hsnCode: Optional[str] = None
    quantity: float = 0
    unitPrice: float = 0
    taxRate: float = 0
    taxableAmount: float = 0
    taxAmount: float = 0
    totalAmount: float = 0


class Supplier(Document):
    name: str
    gstin: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    addressLine1: Optional[str] = None
    city: Optional[str] = None
    stateName: Optional[str] = None
    stateCode: Optional[str] = None
    pincode: Optional[str] = None
    notes: Optional[str] = None
    isActive: bool = True
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "suppliers"


class PurchaseOrder(Document):
    number: Indexed(str, unique=True)  # type: ignore[valid-type]
    supplierId: str
    warehouseId: Optional[str] = None
    status: str = "draft"  # draft | ordered | partial | received | cancelled
    items: list[LineItem] = Field(default_factory=list)
    notes: Optional[str] = None
    orderDate: datetime = Field(default_factory=datetime.utcnow)
    expectedDate: Optional[datetime] = None
    subtotal: float = 0
    taxTotal: float = 0
    grandTotal: float = 0
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "purchaseorders"


class GoodsReceipt(Document):
    number: Indexed(str, unique=True)  # type: ignore[valid-type]
    purchaseOrderId: Optional[str] = None
    supplierId: Optional[str] = None
    warehouseId: str
    status: str = "posted"  # draft | posted
    items: list[LineItem] = Field(default_factory=list)
    notes: Optional[str] = None
    receivedAt: datetime = Field(default_factory=datetime.utcnow)
    createdAt: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "goodsreceipts"


class PurchaseInvoice(Document):
    number: Indexed(str, unique=True)  # type: ignore[valid-type]
    supplierId: str
    purchaseOrderId: Optional[str] = None
    goodsReceiptId: Optional[str] = None
    status: str = "open"  # open | partial | paid | void
    items: list[LineItem] = Field(default_factory=list)
    subtotal: float = 0
    cgst: float = 0
    sgst: float = 0
    igst: float = 0
    taxTotal: float = 0
    grandTotal: float = 0
    amountPaid: float = 0
    balanceDue: float = 0
    invoiceDate: datetime = Field(default_factory=datetime.utcnow)
    dueDate: Optional[datetime] = None
    notes: Optional[str] = None
    createdAt: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "purchaseinvoices"


class SalesInvoice(Document):
    number: Indexed(str, unique=True)  # type: ignore[valid-type]
    orderId: Optional[str] = None
    customerId: Optional[str] = None
    customerName: Optional[str] = None
    customerGstin: Optional[str] = None
    customerStateCode: Optional[str] = None
    sellerStateCode: Optional[str] = None
    status: str = "open"  # open | partial | paid | void
    items: list[LineItem] = Field(default_factory=list)
    subtotal: float = 0
    cgst: float = 0
    sgst: float = 0
    igst: float = 0
    taxTotal: float = 0
    grandTotal: float = 0
    amountPaid: float = 0
    balanceDue: float = 0
    isGstInvoice: bool = False
    invoiceDate: datetime = Field(default_factory=datetime.utcnow)
    notes: Optional[str] = None
    createdAt: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "salesinvoices"


class CreditNote(Document):
    number: Indexed(str, unique=True)  # type: ignore[valid-type]
    salesInvoiceId: Optional[str] = None
    orderId: Optional[str] = None
    customerId: Optional[str] = None
    reason: Optional[str] = None
    items: list[LineItem] = Field(default_factory=list)
    subtotal: float = 0
    cgst: float = 0
    sgst: float = 0
    igst: float = 0
    taxTotal: float = 0
    grandTotal: float = 0
    status: str = "posted"
    createdAt: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "creditnotes"


class SalesReturn(Document):
    number: Indexed(str, unique=True)  # type: ignore[valid-type]
    orderId: Optional[str] = None
    salesInvoiceId: Optional[str] = None
    warehouseId: Optional[str] = None
    customerId: Optional[str] = None
    items: list[LineItem] = Field(default_factory=list)
    reason: Optional[str] = None
    restock: bool = True
    status: str = "posted"
    createdAt: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "salesreturns"


class PartyPayment(Document):
    number: Indexed(str, unique=True)  # type: ignore[valid-type]
    partyType: str  # customer | supplier
    partyId: str
    partyName: Optional[str] = None
    direction: str  # in | out  (in = received from customer, out = paid to supplier)
    amount: float = 0
    method: str = "cash"  # cash | bank | upi | card | online | other
    reference: Optional[str] = None
    invoiceType: Optional[str] = None  # sales_invoice | purchase_invoice
    invoiceId: Optional[str] = None
    notes: Optional[str] = None
    paymentDate: datetime = Field(default_factory=datetime.utcnow)
    createdAt: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "partypayments"


class Role(Document):
    name: Indexed(str, unique=True)  # type: ignore[valid-type]
    description: Optional[str] = None
    permissions: list[str] = Field(default_factory=list)
    isSystem: bool = False
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "roles"


class AiMediaJob(Document):
    model_config = ConfigDict(populate_by_name=True, arbitrary_types_allowed=True, extra="ignore")

    prompt: str = ""
    referenceUrl: Optional[str] = None
    productImageUrls: list[str] = Field(default_factory=list)
    outputUrl: Optional[str] = None
    publishedUrl: Optional[str] = None
    status: str = "pending"  # pending | processing | succeeded | failed
    reviewStatus: str = "pending"  # pending | approved | rejected
    error: Optional[str] = None
    model: Optional[str] = None
    productId: Optional[Any] = None
    createdBy: Optional[Any] = None
    approvedBy: Optional[Any] = None
    approvedAt: Optional[datetime] = None
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "aimedediajobs"
        indexes = [IndexModel([("createdAt", -1)])]


class MediaAsset(Document):
    """Metadata for files in the media library (alt text, etc.)."""

    model_config = ConfigDict(populate_by_name=True, arbitrary_types_allowed=True, extra="ignore")

    key: Indexed(str, unique=True)  # type: ignore[valid-type]  # "{folder}/{name}"
    folder: str
    name: str
    altText: str = ""
    visible: bool = True
    url: Optional[str] = None
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "mediaassets"
        indexes = [IndexModel([("folder", 1), ("name", 1)])]


ALL_DOCUMENTS = [
    User,
    LoginOtp,
    AdminAccount,
    Product,
    Order,
    Category,
    Brand,
    Coupon,
    Warehouse,
    StockBalance,
    StockMovement,
    AbandonedCheckout,
    Setting,
    PaymentTransaction,
    TaxClass,
    Supplier,
    PurchaseOrder,
    GoodsReceipt,
    PurchaseInvoice,
    SalesInvoice,
    CreditNote,
    SalesReturn,
    PartyPayment,
    Role,
    AiMediaJob,
    MediaAsset,
]
