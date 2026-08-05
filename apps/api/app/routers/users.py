from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, EmailStr, Field

from app.documents import AdminAccount, User
from app.deps import AdminUser, CustomersReader, CurrentUser, user_has_admin_access
from app.security import create_access_token, verify_password
from app.serializers import user_public
from app.services.auth_cookie import clear_auth_cookie, set_auth_cookie
from app.services.customer_url_id import ensure_customer_url_id, next_customer_url_id
from app.services.email_quality import QualityEmail
from app.services.otp_auth import consume_login_otp, issue_login_otp
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


def _normalize_indian_mobile(value: str | None) -> str:
    digits = "".join(ch for ch in str(value or "") if ch.isdigit())
    if digits.startswith("91") and len(digits) >= 12:
        digits = digits[-10:]
    elif digits.startswith("0") and len(digits) == 11:
        digits = digits[1:]
    return digits[:10]


def _auth_payload(user: User, token: str) -> dict:
    """Include token for API clients/tests; browsers should prefer the HttpOnly cookie."""
    return user_public(user, token)


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
    token = create_access_token(user.id)
    set_auth_cookie(response, token, scope="admin")
    return _auth_payload(user, token)


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
    _: None = Depends(rate_limit_dependency("checkout-email", limit=20)),
):
    """Find or create a customer by email for checkout.

    First checkout / existing customers: mint a short-lived session (no OTP).
    Staff emails: never mint a JWT — require a different email.
    """
    email = body.email.lower().strip()
    if await _email_is_staff(email):
        return _checkout_continue_payload(email=email, requires_login=True)

    user = await User.find_one(User.email == email)
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
