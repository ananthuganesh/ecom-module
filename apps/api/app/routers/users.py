from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, EmailStr, Field

from app.documents import AdminAccount, User
from app.deps import AdminUser, CustomersReader, CurrentUser, user_has_admin_access
from app.documents import User
from app.security import create_access_token, hash_password, verify_password
from app.serializers import user_public
from app.services.auth_cookie import clear_auth_cookie, set_auth_cookie
from app.services.customer_url_id import ensure_customer_url_id, next_customer_url_id
from app.services.rate_limit import (
    assert_login_not_locked,
    clear_failed_login,
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
    email: EmailStr
    password: str = Field(min_length=_MIN_PASSWORD)


class ProfileUpdate(BaseModel):
    name: str | None = None
    email: EmailStr | None = None
    password: str | None = Field(default=None, min_length=_MIN_PASSWORD)
    currentPassword: str | None = None
    emailSubscribed: bool | None = None
    whatsappSubscribed: bool | None = None


class CheckoutEmailBody(BaseModel):
    email: EmailStr
    name: str | None = None
    emailSubscribed: bool | None = None
    whatsappSubscribed: bool | None = None


class SetPasswordBody(BaseModel):
    password: str = Field(min_length=_MIN_PASSWORD)


def _auth_payload(user: User, token: str) -> dict:
    """Include token for API clients/tests; browsers should prefer the HttpOnly cookie."""
    return user_public(user, token)


@router.post("/login")
async def login(
    body: LoginBody,
    request: Request,
    response: Response,
    _: None = Depends(rate_limit_dependency("login", limit=10)),
):
    email = body.email.lower().strip()
    await assert_login_not_locked(email)
    user = await User.find_one(User.email == email)
    if not user or not user.password or not verify_password(body.password, user.password):
        await record_failed_login(email)
        raise HTTPException(status_code=401, detail="Invalid email or password")
    await clear_failed_login(email)
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
    email = body.email.lower().strip()
    exists = await User.find_one(User.email == email)
    if exists:
        # Uniform messaging to reduce account enumeration (CWE-204).
        raise HTTPException(status_code=400, detail="Unable to create account")
    user = User(name=body.name, email=email, password=hash_password(body.password))
    user.customerUrlId = await next_customer_url_id()
    await user.insert()
    token = create_access_token(user.id)
    set_auth_cookie(response, token, scope="customer")
    return _auth_payload(user, token)


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
    if body.email:
        user.email = body.email.lower().strip()
    if body.password:
        if user.password:
            if not body.currentPassword or not verify_password(body.currentPassword, user.password):
                raise HTTPException(status_code=400, detail="Current password is required")
        user.password = hash_password(body.password)
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


async def _email_is_staff(email: str) -> bool:
    from app.documents import AdminAccount

    return bool(await AdminAccount.find_one(AdminAccount.email == email))


@router.post("/checkout-email")
async def checkout_email(
    body: CheckoutEmailBody,
    response: Response,
    _: None = Depends(rate_limit_dependency("checkout-email", limit=20)),
):
    """Find or create a customer by email for checkout.

    First checkout (new email): mint a short-lived session — no OTP.
    Existing passwordless guest: mint / renew session on any device (conversion-first).
    Existing passworded / staff: never mint a JWT from email alone — require login.
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
        if opt_in is not None and not user.password:
            # Guests can update marketing prefs at checkout without login.
            user.emailSubscribed = opt_in
            user.whatsappSubscribed = opt_in
            changed = True
        if changed:
            user.updatedAt = datetime.utcnow()
            await user.save()

        if user.password:
            return _checkout_continue_payload(email=user.email, requires_login=True)

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
    """Set password on a passwordless customer record (post-purchase account setup)."""
    if user.password:
        raise HTTPException(status_code=400, detail="Password already set")
    user.password = hash_password(body.password)
    user.updatedAt = datetime.utcnow()
    await user.save()
    token = create_access_token(user.id)
    set_auth_cookie(response, token, scope="customer")
    return _auth_payload(user, token)
