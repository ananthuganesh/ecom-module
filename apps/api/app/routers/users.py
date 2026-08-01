from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, EmailStr, Field

from app.deps import AdminUser, CurrentUser, OptionalUser
from app.documents import User
from app.security import create_access_token, hash_password, verify_password
from app.serializers import user_public
from app.services.customer_url_id import ensure_customer_url_id, next_customer_url_id
from app.services.rate_limit import rate_limit_dependency

router = APIRouter(prefix="/api/users", tags=["users"])


class LoginBody(BaseModel):
    email: EmailStr
    password: str


class RegisterBody(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(min_length=6)


class ProfileUpdate(BaseModel):
    name: str | None = None
    email: EmailStr | None = None
    password: str | None = None


class CheckoutEmailBody(BaseModel):
    email: EmailStr
    name: str | None = None


class SetPasswordBody(BaseModel):
    password: str = Field(min_length=6)


@router.post("/login")
async def login(
    body: LoginBody,
    request: Request,
    _: None = Depends(rate_limit_dependency("login", limit=20)),
):
    email = body.email.lower().strip()
    user = await User.find_one(User.email == email)
    if not user or not user.password:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not verify_password(body.password, user.password):
        # plaintext legacy migration
        if not str(user.password).startswith("$2") and user.password == body.password:
            user.password = hash_password(body.password)
            user.updatedAt = datetime.utcnow()
            await user.save()
        else:
            raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(user.id)
    return user_public(user, token)


@router.post("", status_code=201)
async def register(body: RegisterBody):
    email = body.email.lower().strip()
    exists = await User.find_one(User.email == email)
    if exists:
        raise HTTPException(status_code=400, detail="User already exists")
    user = User(name=body.name, email=email, password=hash_password(body.password))
    user.customerUrlId = await next_customer_url_id()
    await user.insert()
    token = create_access_token(user.id)
    return user_public(user, token)


@router.get("/profile")
async def get_profile(user: CurrentUser):
    return user_public(user)


@router.put("/profile")
async def update_profile(body: ProfileUpdate, user: CurrentUser):
    if body.name:
        user.name = body.name
    if body.email:
        user.email = body.email.lower().strip()
    if body.password:
        user.password = hash_password(body.password)
    user.updatedAt = datetime.utcnow()
    await user.save()
    return user_public(user, create_access_token(user.id))


@router.get("")
async def list_users(
    _: AdminUser,
    page: int = Query(default=1, ge=1),
    skip: int | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
):
    from app.services.pagination import parse_pagination

    sk, lim, _pg = parse_pagination(page=page, skip=skip, limit=limit)
    users = await User.find_all().skip(sk).limit(lim).to_list()
    return [user_public(u) for u in users]


@router.get("/{user_id}")
async def get_user(user_id: str, _: AdminUser):
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
async def delete_user(user_id: str, _: AdminUser):
    from bson import ObjectId

    user = await User.get(ObjectId(user_id))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.isAdmin:
        raise HTTPException(status_code=400, detail="Cannot delete admin user")
    await user.delete()
    return {"message": "User removed"}


def _is_staff_account(user: User) -> bool:
    if bool(getattr(user, "isAdmin", False)):
        return True
    role_id = getattr(user, "roleId", None)
    return bool(role_id and str(role_id).strip())


@router.post("/checkout-email")
async def checkout_email(
    body: CheckoutEmailBody,
    request: Request,
    current: OptionalUser,
    _: None = Depends(rate_limit_dependency("checkout-email", limit=30)),
):
    """Find or create a customer by email for checkout.

    First checkout (new email): mint a short-lived session — no OTP.
    Existing passworded / staff: never mint a JWT from email alone.
    Existing passwordless: only renew JWT if this browser already owns that session
    (same device return). Cold re-entry on a new device does not get a token.
    """
    email = body.email.lower().strip()
    user = await User.find_one(User.email == email)
    created = False
    if not user:
        name = (body.name or "").strip() or email.split("@")[0]
        user = User(name=name, email=email, password=None)
        user.customerUrlId = await next_customer_url_id()
        await user.insert()
        created = True
    else:
        if _is_staff_account(user):
            raise HTTPException(
                status_code=403,
                detail="This email cannot be used for guest checkout. Sign in to continue.",
            )
        await ensure_customer_url_id(user)
        if body.name and str(body.name).strip():
            current_name = (user.name or "").strip().lower()
            if not current_name or current_name in {"guest user", "guest", "customer"}:
                user.name = str(body.name).strip()
                user.updatedAt = datetime.utcnow()
                await user.save()

        if user.password:
            return {
                "email": user.email,
                "hasPassword": True,
                "created": False,
                "requiresLogin": True,
            }

        # Existing passwordless — only continue session if already authenticated as them.
        same_session = bool(current and str(current.id) == str(user.id))
        if not same_session:
            return {
                "email": user.email,
                "hasPassword": False,
                "created": False,
                "requiresLogin": False,
                "requiresExistingSession": True,
            }

    token = create_access_token(user.id, hours=48)
    data = user_public(user, token)
    data["created"] = created
    data["requiresLogin"] = False
    data["requiresExistingSession"] = False
    return data


@router.post("/set-password")
async def set_password(body: SetPasswordBody, user: CurrentUser):
    """Set password on a passwordless customer record (post-purchase account setup)."""
    if user.password:
        raise HTTPException(status_code=400, detail="Password already set")
    user.password = hash_password(body.password)
    user.updatedAt = datetime.utcnow()
    await user.save()
    return user_public(user, create_access_token(user.id))
