from datetime import datetime

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, Field

from app.deps import OptionalUser
from app.documents import AbandonedCheckout, User
from app.security import create_access_token
from app.serializers import user_public
from app.services import cart_recovery
from app.services.auth_cookie import set_auth_cookie
from app.services.rate_limit import rate_limit_dependency

router = APIRouter(prefix="/api/abandoned-checkout", tags=["abandoned"])


def _merge_customer_details(existing: dict | None, incoming: dict | None) -> dict:
    """Keep prior non-empty fields; never wipe a name with blanks from an early upsert."""
    base = dict(existing or {}) if isinstance(existing, dict) else {}
    nxt = incoming if isinstance(incoming, dict) else {}
    for key, value in nxt.items():
        text = value if not isinstance(value, str) else value.strip()
        if text in (None, ""):
            continue
        base[key] = text if isinstance(value, str) else value
    return base


class RecoverBody(BaseModel):
    token: str = Field(min_length=16, max_length=128)


@router.post("")
async def upsert(
    body: dict,
    request: Request,
    user: OptionalUser,
    _: None = Depends(rate_limit_dependency("abandoned", limit=30)),
):
    guest_id = body.get("guestId")
    # Authenticated users may only write their own abandoned cart; guests cannot spoof userId.
    if user is not None:
        user_id = user.id
        guest_id = None
    else:
        user_id = None
        guest_id = guest_id

    q = {"status": "abandoned"}
    if user_id is not None:
        q["userId"] = user_id
    elif guest_id:
        q["guestId"] = guest_id
    existing = await AbandonedCheckout.find_one(q) if (user_id is not None or guest_id) else None
    if existing:
        existing.items = body.get("items") or existing.items
        existing.totalAmount = float(body.get("totalAmount") or existing.totalAmount)
        existing.customerDetails = _merge_customer_details(
            existing.customerDetails, body.get("customerDetails")
        )
        # Prefer account profile when logged in and details still thin.
        if user is not None:
            existing.customerDetails = _merge_customer_details(
                existing.customerDetails,
                {
                    "name": getattr(user, "name", None) or "",
                    "email": getattr(user, "email", None) or "",
                    "phone": getattr(user, "phone", None) or "",
                },
            )
        existing.lastActivityAt = datetime.utcnow()
        await cart_recovery.ensure_recovery_token(existing)
        await existing.save()
        return cart_recovery.public_checkout_dict(existing)

    details = _merge_customer_details({}, body.get("customerDetails"))
    if user is not None:
        details = _merge_customer_details(
            details,
            {
                "name": getattr(user, "name", None) or "",
                "email": getattr(user, "email", None) or "",
                "phone": getattr(user, "phone", None) or "",
            },
        )
    doc = AbandonedCheckout(
        userId=user_id,
        guestId=guest_id,
        items=body.get("items") or [],
        totalAmount=float(body.get("totalAmount") or 0),
        customerDetails=details,
        status="abandoned",
    )
    await cart_recovery.ensure_recovery_token(doc)
    await doc.insert()
    return cart_recovery.public_checkout_dict(doc)


async def _recover_payload(token: str, response: Response) -> dict:
    token = (token or "").strip()
    if not token:
        raise HTTPException(status_code=404, detail="Recovery link invalid or expired")

    checkout = await AbandonedCheckout.find_one(AbandonedCheckout.recoveryToken == token)
    if not checkout or not cart_recovery.token_is_valid(checkout):
        raise HTTPException(status_code=404, detail="Recovery link invalid or expired")

    details = dict(checkout.customerDetails or {})
    items = cart_recovery.map_items_for_cart(checkout.items)
    shipping = cart_recovery.shipping_from_customer_details(details)

    session = None
    known_user = None
    user: User | None = None

    if checkout.userId:
        try:
            uid = checkout.userId
            if not isinstance(uid, ObjectId) and ObjectId.is_valid(str(uid)):
                uid = ObjectId(str(uid))
            user = await User.get(uid)
        except Exception:
            user = None

    if not user:
        email = str(details.get("email") or "").strip().lower()
        if email:
            user = await User.find_one(User.email == email)

    if user:
        is_staff = bool(getattr(user, "isAdmin", False)) or bool(
            getattr(user, "roleId", None) and str(user.roleId).strip()
        )
        known_user = {
            "email": user.email,
            "name": user.name,
            "hasPassword": bool(user.password),
            "isStaff": is_staff,
        }
        # Magic link proves email ownership — OK to mint a short guest session for
        # passwordless shoppers only. Never auto-login passworded or staff accounts.
        if not user.password and not is_staff:
            token_jwt = create_access_token(user.id, hours=48)
            set_auth_cookie(response, token_jwt, hours=48, scope="customer")
            session = user_public(user, token_jwt)

    checkout.recoveredAt = datetime.utcnow()
    await checkout.save()

    return {
        "items": items,
        "totalAmount": float(checkout.totalAmount or 0),
        "customerDetails": details,
        "shippingAddress": shipping,
        "knownUser": known_user,
        "session": session,
    }


@router.post("/recover")
async def recover_cart_post(
    body: RecoverBody,
    response: Response,
    _: None = Depends(rate_limit_dependency("cart-recover", limit=20)),
):
    """Preferred recovery path — token in JSON body (avoids Referer leakage)."""
    return await _recover_payload(body.token, response)


@router.get("/recover")
async def recover_cart_get(
    response: Response,
    token: str = Query(..., min_length=16, max_length=128),
    _: None = Depends(rate_limit_dependency("cart-recover", limit=20)),
):
    """Legacy email-link support. Prefer POST /recover from the storefront."""
    return await _recover_payload(token, response)
