from typing import Annotated

from bson import ObjectId
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.documents import AdminAccount, Role, User
from app.security import decode_token
from app.services.auth_cookie import token_from_request

bearer_scheme = HTTPBearer(auto_error=False)


async def _user_from_token(token: str | None) -> User | None:
    if not token:
        return None
    try:
        payload = decode_token(token)
        user_id = payload.get("id")
        if not user_id or not ObjectId.is_valid(str(user_id)):
            return None
        return await User.get(ObjectId(str(user_id)))
    except Exception:
        return None


async def _admin_from_token(token: str | None) -> AdminAccount | None:
    if not token:
        return None
    try:
        payload = decode_token(token)
        user_id = payload.get("id")
        if not user_id or not ObjectId.is_valid(str(user_id)):
            return None
        return await AdminAccount.get(ObjectId(str(user_id)))
    except Exception:
        return None


async def get_current_user(
    request: Request,
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> User:
    """Storefront / customer session (`ua_session`)."""
    bearer = creds.credentials if creds and creds.scheme.lower() == "bearer" else None
    token = token_from_request(request, bearer, scope="customer")
    user = await _user_from_token(token)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authorized, no token",
        )
    return user


async def get_optional_user(
    request: Request,
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> User | None:
    bearer = creds.credentials if creds and creds.scheme.lower() == "bearer" else None
    token = token_from_request(request, bearer, scope="customer")
    return await _user_from_token(token)


async def get_staff_session_user(
    request: Request,
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> AdminAccount:
    """Admin panel session (`ua_admin_session`) — AdminAccount only."""
    bearer = creds.credentials if creds and creds.scheme.lower() == "bearer" else None
    token = token_from_request(request, bearer, scope="admin")
    user = await _admin_from_token(token)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authorized, no token",
        )
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
OptionalUser = Annotated[User | None, Depends(get_optional_user)]
StaffSessionUser = Annotated[AdminAccount, Depends(get_staff_session_user)]


async def _role_for(user: AdminAccount | User) -> Role | None:
    """Return the assigned role, treating stale or malformed IDs as no role."""
    role_id = getattr(user, "roleId", None)
    if not role_id or not ObjectId.is_valid(str(role_id)):
        return None
    return await Role.get(ObjectId(str(role_id)))


def _perm_match(granted: list[str], needed: str) -> bool:
    """Match exact, global, and resource-scoped wildcard permissions."""
    if "*" in granted or needed in granted:
        return True
    resource, separator, _ = needed.partition(".")
    return bool(separator and f"{resource}.*" in granted)


async def user_has_admin_access(user: AdminAccount | User) -> bool:
    """Whether this account may use the admin panel."""
    if getattr(user, "isAdmin", False):
        return True
    role = await _role_for(user)
    perms = list(role.permissions or []) if role else []
    return "*" in perms or "admin.access" in perms


async def require_admin(user: StaffSessionUser) -> AdminAccount:
    """Admin panel access: owner Admin, wildcard (*), or staff admin.access."""
    if await user_has_admin_access(user):
        return user
    raise HTTPException(status_code=403, detail="Admin access required")


async def require_role_manager(user: StaffSessionUser) -> AdminAccount:
    """Only Admin / wildcard owners may manage users and roles."""
    if user.isAdmin:
        return user
    role = await _role_for(user)
    perms = list(role.permissions or []) if role else []
    if "*" in perms or (role and role.name == "Admin"):
        return user
    raise HTTPException(status_code=403, detail="Admin role required")


def require_permission(*perms: str):
    async def _dep(user: StaffSessionUser) -> AdminAccount:
        if user.isAdmin:
            return user
        role = await _role_for(user)
        granted = list(role.permissions or []) if role else []
        # Panel entry gate — fine-grained perms alone must not open admin APIs.
        if "*" not in granted and "admin.access" not in granted:
            raise HTTPException(status_code=403, detail="Admin access required")
        if "*" in granted:
            return user
        if any(_perm_match(granted, permission) for permission in perms):
            return user
        raise HTTPException(status_code=403, detail="Permission denied")

    return _dep


AdminUser = Annotated[AdminAccount, Depends(require_admin)]
RoleManager = Annotated[AdminAccount, Depends(require_role_manager)]
OrdersReader = Annotated[AdminAccount, Depends(require_permission("orders.read", "orders.write"))]
OrdersWriter = Annotated[AdminAccount, Depends(require_permission("orders.write"))]
CustomersReader = Annotated[AdminAccount, Depends(require_permission("customers.read"))]
CustomersWriter = Annotated[AdminAccount, Depends(require_permission("customers.write"))]
PaymentsWriter = Annotated[AdminAccount, Depends(require_permission("payments.write"))]
