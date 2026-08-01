from typing import Annotated

from bson import ObjectId
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.documents import Role, User
from app.security import decode_token

bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> User:
    if creds is None or creds.scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authorized, no token")
    try:
        payload = decode_token(creds.credentials)
        user_id = payload.get("id")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token payload")
        user = await User.get(ObjectId(user_id))
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Not authorized, token failed")


async def get_optional_user(
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> User | None:
    if creds is None or creds.scheme.lower() != "bearer":
        return None
    try:
        payload = decode_token(creds.credentials)
        user_id = payload.get("id")
        if not user_id:
            return None
        user = await User.get(ObjectId(user_id))
        if not user:
            return None
        return user
    except Exception:
        return None


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
    if user.isAdmin:
        return user
    role = await _role_for(user)
    if role and _perm_match(role.permissions, "admin.access"):
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
