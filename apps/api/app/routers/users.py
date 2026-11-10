from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, EmailStr, Field

from app.documents import AdminAccount, User
from app.deps import AdminUser, CustomersReader, CurrentUser, OptionalUser, user_has_admin_access
from app.config import get_settings
from app.security import (
    create_access_token,
    create_admin_login_challenge,
    decode_admin_login_challenge,
    verify_password,
)
from app.serializers import user_public
from app.services.auth_cookie import clear_auth_cookie, set_auth_cookie
from app.services import customer_addresses as addr_svc
from app.services.customer_addresses import (
    AddressBody,
    ensure_address_ids as _ensure_address_ids,
    normalize_indian_mobile as _normalize_indian_mobile,
)
from app.services.customer_url_id import ensure_customer_url_id, next_customer_url_id
from app.services.email_quality import QualityEmail
from app.services.otp_auth import admin_otp_key, consume_login_otp, issue_login_otp
from app.services.rate_limit import (
    assert_login_not_locked,
    clear_failed_login,
    client_ip,
    enforce_rate_limit,
    rate_limit_dependency,
    record_failed_login,
)

router = APIRouter(prefix="/api/users", tags=["users"])

_MIN_PASSWORD = 8


class LoginBody(BaseModel):
    email: EmailStr
    password: str


class RegisterBody(BaseModel):
    name: str
    email: QualityEmail
    password: str = Field(min_length=_MIN_PASSWORD)


class ProfileUpdate(BaseModel):
    name: str | None = None
    email: QualityEmail | None = None
    phone: str | None = None
    password: str | None = Field(default=None, min_length=_MIN_PASSWORD)
    currentPassword: str | None = None
    emailSubscribed: bool | None = None
    whatsappSubscribed: bool | None = None


class CheckoutEmailBody(BaseModel):
    email: QualityEmail
    name: str | None = None
    emailSubscribed: bool | None = None
    whatsappSubscribed: bool | None = None


class SetPasswordBody(BaseModel):
    password: str = Field(min_length=_MIN_PASSWORD)


class OtpRequestBody(BaseModel):
    email: QualityEmail


class OtpVerifyBody(BaseModel):
    email: QualityEmail
    code: str = Field(min_length=6, max_length=6)


def _auth_payload(user: User, token: str) -> dict:
    """Profile only. The session lives in the HttpOnly cookie set alongside it;
    echoing the JWT in the body would let any injected script read and steal it."""
    return user_public(user)


async def _email_is_staff(email: str) -> bool:
    return bool(await AdminAccount.find_one(AdminAccount.email == email))


@router.post("/login")
async def login(
    body: LoginBody,
    request: Request,
    response: Response,
    _: None = Depends(rate_limit_dependency("login", limit=10)),
):
    """Customer password login is retired — use email OTP."""
    raise HTTPException(
        status_code=410,
        detail="Password login is no longer available. Sign in with the email code instead.",
    )


@router.post("/otp/request")
async def otp_request(
    body: OtpRequestBody,
    request: Request,
    _: None = Depends(rate_limit_dependency("otp-request", limit=8, window_seconds=15 * 60)),
):
    email = body.email.lower().strip()
    # Extra per-email throttle (on top of IP limit).
    await enforce_rate_limit(
        f"otp-request-email:{email}:{client_ip(request)}",
        limit=3,
        window_seconds=15 * 60,
    )
    if await _email_is_staff(email):
        # Anti-enumeration: same success shape; do not send OTP to staff emails.
        return {"ok": True}
    await issue_login_otp(email)
    return {"ok": True}


@router.post("/otp/verify")
async def otp_verify(
    body: OtpVerifyBody,
    request: Request,
    response: Response,
    _: None = Depends(rate_limit_dependency("otp-verify", limit=20, window_seconds=15 * 60)),
):
    email = body.email.lower().strip()
    code = str(body.code or "").strip()
    await enforce_rate_limit(
        f"otp-verify-email:{email}:{client_ip(request)}",
        limit=10,
        window_seconds=15 * 60,
    )
    if await _email_is_staff(email):
        raise HTTPException(status_code=400, detail="Invalid or expired code")

    await consume_login_otp(email, code)

    user = await User.find_one(User.email == email)
    if not user:
        user = User(
            name=email.split("@")[0],
            email=email,
            password=None,
            emailSubscribed=True,
            whatsappSubscribed=True,
        )
        user.customerUrlId = await next_customer_url_id()
        await user.insert()
    else:
        await ensure_customer_url_id(user)

    token = create_access_token(user.id)
    set_auth_cookie(response, token, scope="customer")
    return _auth_payload(user, token)


@router.post("/admin/login")
async def admin_login(
    body: LoginBody,
    response: Response,
    _: None = Depends(rate_limit_dependency("admin-login", limit=10)),
):
    """Staff login — sets `ua_admin_session` only (does not affect storefront)."""
    email = body.email.lower().strip()
    await assert_login_not_locked(email)
    user = await AdminAccount.find_one(AdminAccount.email == email)
    if not user or not user.password or not verify_password(body.password, user.password):
        await record_failed_login(email)
        raise HTTPException(status_code=401, detail="Invalid email or password")
    await clear_failed_login(email)
    if not await user_has_admin_access(user):
        raise HTTPException(status_code=403, detail="Admin access required")

    if get_settings().admin_login_otp:
        # Password alone is not enough: no session until the emailed code is verified.
        await issue_login_otp(user.email, key=admin_otp_key(user.email), audience="admin")
        return {
            "otpRequired": True,
            "challenge": create_admin_login_challenge(user.id),
            "email": _mask_email(user.email),
        }

    token = create_access_token(user.id)
    set_auth_cookie(response, token, scope="admin")
    return _auth_payload(user, token)


def _mask_email(email: str) -> str:
    local, _, domain = str(email or "").partition("@")
    if not domain:
        return ""
    shown = local[:2] if len(local) > 2 else local[:1]
    return f"{shown}{'•' * max(1, len(local) - len(shown))}@{domain}"


class AdminOtpVerifyBody(BaseModel):
    challenge: str = Field(min_length=20, max_length=1000)
    code: str = Field(min_length=6, max_length=6)


class AdminOtpResendBody(BaseModel):
    challenge: str = Field(min_length=20, max_length=1000)


async def _admin_from_challenge(challenge: str) -> AdminAccount:
    from bson import ObjectId

    admin_id = decode_admin_login_challenge(challenge)
    admin = await AdminAccount.get(ObjectId(admin_id)) if admin_id and ObjectId.is_valid(admin_id) else None
    if not admin:
        raise HTTPException(status_code=401, detail="Your sign-in expired. Enter your password again.")
    return admin


@router.post("/admin/login/verify")
async def admin_login_verify(
    body: AdminOtpVerifyBody,
    request: Request,
    response: Response,
    _: None = Depends(rate_limit_dependency("admin-otp-verify", limit=20, window_seconds=15 * 60)),
):
    """Second step of staff login: the emailed code starts the admin session."""
    admin = await _admin_from_challenge(body.challenge)
    await enforce_rate_limit(
        f"admin-otp-verify:{admin.id}:{client_ip(request)}", limit=10, window_seconds=15 * 60
    )
    await consume_login_otp(admin_otp_key(admin.email), body.code.strip())
    # Access could have been revoked while the code was in flight.
    if not await user_has_admin_access(admin):
        raise HTTPException(status_code=403, detail="Admin access required")
    token = create_access_token(admin.id)
    set_auth_cookie(response, token, scope="admin")
    return _auth_payload(admin, token)


@router.post("/admin/login/resend")
async def admin_login_resend(
    body: AdminOtpResendBody,
    request: Request,
    _: None = Depends(rate_limit_dependency("admin-otp-resend", limit=6, window_seconds=15 * 60)),
):
    admin = await _admin_from_challenge(body.challenge)
    await enforce_rate_limit(
        f"admin-otp-resend:{admin.id}", limit=3, window_seconds=15 * 60
    )
    await issue_login_otp(admin.email, key=admin_otp_key(admin.email), audience="admin")
    return {"ok": True}


@router.post("", status_code=201)
async def register(
    body: RegisterBody,
    response: Response,
    _: None = Depends(rate_limit_dependency("register", limit=10)),
):
    raise HTTPException(
        status_code=410,
        detail="Password registration is no longer available. Sign in with the email code instead.",
    )


@router.post("/logout")
async def logout(response: Response):
    clear_auth_cookie(response, scope="customer")
    return {"ok": True}


@router.post("/admin/logout")
async def admin_logout(response: Response):
    clear_auth_cookie(response, scope="admin")
    return {"ok": True}


@router.get("/profile")
async def get_profile(user: CurrentUser):
    if _ensure_address_ids(user):
        user.updatedAt = datetime.utcnow()
        await user.save()
    return user_public(user)


@router.get("/admin/profile")
async def get_admin_profile(user: AdminUser):
    return user_public(user)


@router.put("/profile")
async def update_profile(body: ProfileUpdate, user: CurrentUser, response: Response):
    if body.name:
        user.name = body.name
    # Email is the OTP identity — never change from profile.
    if body.email is not None:
        incoming = str(body.email).lower().strip()
        current = str(user.email or "").lower().strip()
        if incoming and incoming != current:
            raise HTTPException(
                status_code=400,
                detail="Email cannot be changed. Sign in with a different email to use another account.",
            )
    if body.phone is not None:
        phone = _normalize_indian_mobile(body.phone)
        existing = _normalize_indian_mobile(getattr(user, "phone", None))
        if existing:
            if phone and phone != existing:
                raise HTTPException(
                    status_code=400,
                    detail="Phone number cannot be changed once set.",
                )
        elif phone:
            if len(phone) != 10 or phone[0] not in "6789":
                raise HTTPException(
                    status_code=400,
                    detail="Enter a valid 10-digit Indian mobile number.",
                )
            user.phone = phone
    if body.password:
        raise HTTPException(
            status_code=410,
            detail="Passwords are no longer used. Sign in with the email code instead.",
        )
    if body.emailSubscribed is not None:
        user.emailSubscribed = bool(body.emailSubscribed)
    if body.whatsappSubscribed is not None:
        user.whatsappSubscribed = bool(body.whatsappSubscribed)
    user.updatedAt = datetime.utcnow()
    await user.save()
    token = create_access_token(user.id)
    set_auth_cookie(response, token, scope="customer")
    return _auth_payload(user, token)


@router.get("/addresses")
async def list_addresses(user: CurrentUser):
    if _ensure_address_ids(user):
        user.updatedAt = datetime.utcnow()
        await user.save()
    return user_public(user).get("addresses") or []


@router.post("/addresses")
async def add_address(body: AddressBody, user: CurrentUser, response: Response):
    addr_svc.add_address(user, body)
    return await _save_addresses(user, response)


@router.put("/addresses/{address_id}")
async def update_address(
    address_id: str, body: AddressBody, user: CurrentUser, response: Response
):
    addr_svc.update_address(user, address_id, body)
    return await _save_addresses(user, response)


@router.post("/addresses/{address_id}/default")
async def set_default_address(address_id: str, user: CurrentUser, response: Response):
    addr_svc.make_default(user, address_id)
    return await _save_addresses(user, response)


@router.delete("/addresses/{address_id}")
async def delete_address(address_id: str, user: CurrentUser, response: Response):
    addr_svc.delete_address(user, address_id)
    return await _save_addresses(user, response)


async def _save_addresses(user: User, response: Response) -> dict:
    await user.save()
    token = create_access_token(user.id)
    set_auth_cookie(response, token, scope="customer")
    return _auth_payload(user, token)


@router.get("")
async def list_users(
    _: CustomersReader,
    page: int = Query(default=1, ge=1),
    skip: int | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
):
    from app.services.customers import customer_mongo_filter
    from app.services.pagination import parse_pagination

    sk, lim, _pg = parse_pagination(page=page, skip=skip, limit=limit)
    users = await User.find(customer_mongo_filter()).skip(sk).limit(lim).to_list()
    return [user_public(u) for u in users]


@router.get("/{user_id}")
async def get_user(user_id: str, _: CustomersReader):
    from bson import ObjectId

    user = await User.get(ObjectId(user_id))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user_public(user)


@router.put("/{user_id}")
async def update_user(user_id: str, body: dict, actor: AdminUser):
    from bson import ObjectId

    user = await User.get(ObjectId(user_id))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if "name" in body and body["name"]:
        user.name = body["name"]
    if "email" in body and body["email"]:
        user.email = str(body["email"]).lower().strip()
    # isAdmin / role elevation is not allowed via this endpoint (privilege escalation).
    if "isAdmin" in body or "roleId" in body:
        raise HTTPException(
            status_code=400,
            detail="Use role assignment to change admin access",
        )
    user.updatedAt = datetime.utcnow()
    await user.save()
    return user_public(user)


@router.delete("/{user_id}")
async def delete_user(user_id: str, actor: AdminUser):
    from bson import ObjectId

    from app.documents import AbandonedCheckout, Order

    user = await User.get(ObjectId(user_id))
    if not user:
        raise HTTPException(status_code=404, detail="Customer not found")
    # Staff live in `admins` — this endpoint only deletes customers.
    if bool(getattr(user, "isAdmin", False)) or (
        getattr(user, "roleId", None) and str(user.roleId).strip()
    ):
        raise HTTPException(
            status_code=400,
            detail="Staff accounts are managed under Settings → Users",
        )
    order_count = await Order.find(
        {
            "customerId": user.id,
            "status": {"$nin": ["abandoned", "cancelled"]},
        }
    ).count()
    if order_count > 0:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete a customer who has orders.",
        )
    ac_col = AbandonedCheckout.get_pymongo_collection()
    await ac_col.update_many(
        {"userId": user.id},
        {"$set": {"userId": None}},
    )
    await user.delete()
    return {"message": "User removed"}


def _checkout_continue_payload(*, email: str, requires_login: bool) -> dict:
    """Uniform checkout-email shape to reduce enumeration side-channels."""
    return {
        "email": email,
        "created": False,
        "requiresLogin": requires_login,
        "requiresExistingSession": False,
        "continue": True,
    }


@router.post("/checkout-email")
async def checkout_email(
    body: CheckoutEmailBody,
    response: Response,
    current: OptionalUser,
    _: None = Depends(rate_limit_dependency("checkout-email", limit=20)),
):
    """Find or create a customer by email for checkout.

    New email: create the customer and start a short-lived session.
    Existing customer: only continue if this browser is already signed in as
    them; otherwise they must verify with an emailed code. Typing someone
    else's email must never open their account, addresses or orders.
    Staff emails: never mint a JWT — require a different email.
    """
    email = body.email.lower().strip()
    if await _email_is_staff(email):
        return _checkout_continue_payload(email=email, requires_login=True)

    user = await User.find_one(User.email == email)
    if user and not (current and str(current.id) == str(user.id)):
        payload = _checkout_continue_payload(email=email, requires_login=True)
        payload["verifyWithCode"] = True
        return payload
    created = False
    # Checkout checkbox sends both flags as the same value.
    opt_in = None
    if body.emailSubscribed is not None:
        opt_in = bool(body.emailSubscribed)
    elif body.whatsappSubscribed is not None:
        opt_in = bool(body.whatsappSubscribed)

    if not user:
        name = (body.name or "").strip() or email.split("@")[0]
        user = User(
            name=name,
            email=email,
            password=None,
            emailSubscribed=True if opt_in is None else opt_in,
            whatsappSubscribed=True if opt_in is None else opt_in,
        )
        user.customerUrlId = await next_customer_url_id()
        await user.insert()
        created = True
    else:
        await ensure_customer_url_id(user)
        changed = False
        if body.name and str(body.name).strip():
            current_name = (user.name or "").strip().lower()
            if not current_name or current_name in {"guest user", "guest", "customer"}:
                user.name = str(body.name).strip()
                changed = True
        if opt_in is not None:
            # Marketing prefs at checkout without a separate login.
            user.emailSubscribed = opt_in
            user.whatsappSubscribed = opt_in
            changed = True
        if changed:
            user.updatedAt = datetime.utcnow()
            await user.save()

    token = create_access_token(user.id, hours=48)
    set_auth_cookie(response, token, hours=48, scope="customer")
    data = _auth_payload(user, token)
    data["created"] = created
    data["requiresLogin"] = False
    data["requiresExistingSession"] = False
    data["continue"] = True
    return data


@router.post("/set-password")
async def set_password(
    body: SetPasswordBody,
    user: CurrentUser,
    response: Response,
    _: None = Depends(rate_limit_dependency("set-password", limit=10)),
):
    """Password setup retired — customers sign in with email OTP."""
    raise HTTPException(
        status_code=410,
        detail="Passwords are no longer used. Sign in with the email code instead.",
    )
