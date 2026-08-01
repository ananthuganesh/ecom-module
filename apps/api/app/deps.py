from typing import Annotated

from bson import ObjectId
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.documents import Role, User
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


async def get_current_user(
    request: Request,
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> User:
    bearer = creds.credentials if creds and creds.scheme.lower() == "bearer" else None
    token = token_from_request(request, bearer)
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
    token = token_from_request(request, bearer)
    return await _user_from_token(token)


CurrentUser = Annotated[User, Depends(get_current_user)]
OptionalUser = Annotated[User | None, Depends(get_optional_user)]


async def _role_for(user: User) -> Role | None:
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


async def require_admin(user: CurrentUser) -> User:
    """Full admin surface: isAdmin flag or wildcard (*) role only.

    Staff roles must not gain AdminUser access via a loose admin.access grant.
    """
    if user.isAdmin:
        return user
    role = await _role_for(user)
    if role and "*" in (role.permissions or []):
        return user
    raise HTTPException(status_code=403, detail="Admin access required")


def require_permission(*perms: str):
    async def _dep(user: CurrentUser) -> User:
        if user.isAdmin:
            return user
        role = await _role_for(user)
        if role and any(_perm_match(role.permissions, permission) for permission in perms):
            return user
        raise HTTPException(status_code=403, detail="Permission denied")

    return _dep


AdminUser = Annotated[User, Depends(require_admin)]
OrdersReader = Annotated[User, Depends(require_permission("orders.read", "orders.write"))]
OrdersWriter = Annotated[User, Depends(require_permission("orders.write"))]
CustomersReader = Annotated[User, Depends(require_permission("customers.read"))]
CustomersWriter = Annotated[User, Depends(require_permission("customers.read", "customers.write"))]
PaymentsWriter = Annotated[User, Depends(require_permission("payments.write"))]
