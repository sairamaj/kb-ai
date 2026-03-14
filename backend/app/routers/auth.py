from __future__ import annotations

import secrets
import uuid

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import CurrentUser, create_access_token
from app.config import (
    FRONTEND_URL,
    GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET,
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    REDIRECT_BASE_URL,
)
from app.database import get_db
from app.limits import (
    PRO_COLLECTION_LIMIT,
    PRO_CONVERSATION_LIMIT,
    STARTER_COLLECTION_LIMIT,
    STARTER_CONVERSATION_LIMIT,
)
from app.models import Collection, Conversation, OAuthProvider, User, UserRole

router = APIRouter(prefix="/auth", tags=["auth"])

# ---------------------------------------------------------------------------
# OAuth provider configuration
# ---------------------------------------------------------------------------

_PROVIDERS = {
    "google": {
        "auth_url": "https://accounts.google.com/o/oauth2/v2/auth",
        "token_url": "https://oauth2.googleapis.com/token",
        "userinfo_url": "https://www.googleapis.com/oauth2/v3/userinfo",
        "scope": "openid email profile",
        "client_id": lambda: GOOGLE_CLIENT_ID,
        "client_secret": lambda: GOOGLE_CLIENT_SECRET,
    },
    "github": {
        "auth_url": "https://github.com/login/oauth/authorize",
        "token_url": "https://github.com/login/oauth/access_token",
        "userinfo_url": "https://api.github.com/user",
        "scope": "read:user user:email",
        "client_id": lambda: GITHUB_CLIENT_ID,
        "client_secret": lambda: GITHUB_CLIENT_SECRET,
    },
}


def _provider_cfg(provider: str) -> dict:
    cfg = _PROVIDERS.get(provider)
    if not cfg:
        raise HTTPException(status_code=404, detail=f"Unknown provider: {provider}")
    client_id = cfg["client_id"]()
    if not client_id:
        raise HTTPException(
            status_code=503,
            detail=f"{provider.upper()}_CLIENT_ID is not configured",
        )
    return cfg


# ---------------------------------------------------------------------------
# Login — redirect browser to OAuth provider
# ---------------------------------------------------------------------------

@router.get("/{provider}/login")
async def oauth_login(provider: str, response: Response) -> RedirectResponse:
    cfg = _provider_cfg(provider)
    state = secrets.token_urlsafe(32)
    redirect_uri = f"{REDIRECT_BASE_URL}/auth/{provider}/callback"

    params = {
        "client_id": cfg["client_id"](),
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": cfg["scope"],
        "state": state,
    }
    if provider == "google":
        params["access_type"] = "online"

    from urllib.parse import urlencode
    auth_url = f"{cfg['auth_url']}?{urlencode(params)}"

    resp = RedirectResponse(url=auth_url, status_code=302)
    resp.set_cookie(
        key="oauth_state",
        value=state,
        httponly=True,
        samesite="lax",
        max_age=300,  # 5 minutes
        path="/",
    )
    return resp


# ---------------------------------------------------------------------------
# Callback — exchange code, upsert user, set JWT cookie
# ---------------------------------------------------------------------------

async def _get_github_email(token: str, client: httpx.AsyncClient) -> str:
    r = await client.get(
        "https://api.github.com/user/emails",
        headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
    )
    r.raise_for_status()
    for entry in r.json():
        if entry.get("primary") and entry.get("verified"):
            return entry["email"]
    raise HTTPException(status_code=400, detail="Could not retrieve verified GitHub email")


@router.get("/{provider}/callback")
async def oauth_callback(
    provider: str,
    code: str,
    state: str,
    request: Request,
) -> RedirectResponse:
    from app.database import AsyncSessionLocal

    cfg = _provider_cfg(provider)
    redirect_uri = f"{REDIRECT_BASE_URL}/auth/{provider}/callback"

    # Verify state cookie (CSRF protection)
    stored_state = request.cookies.get("oauth_state")
    if not stored_state or stored_state != state:
        raise HTTPException(status_code=400, detail="Invalid OAuth state")

    async with httpx.AsyncClient() as client:
        # Exchange authorization code for access token
        if provider == "google":
            token_resp = await client.post(
                cfg["token_url"],
                data={
                    "code": code,
                    "client_id": cfg["client_id"](),
                    "client_secret": cfg["client_secret"](),
                    "redirect_uri": redirect_uri,
                    "grant_type": "authorization_code",
                },
            )
        else:  # github
            token_resp = await client.post(
                cfg["token_url"],
                data={
                    "code": code,
                    "client_id": cfg["client_id"](),
                    "client_secret": cfg["client_secret"](),
                    "redirect_uri": redirect_uri,
                },
                headers={"Accept": "application/json"},
            )

        token_resp.raise_for_status()
        token_data = token_resp.json()
        access_token = token_data.get("access_token") or token_data.get("id_token")
        if not access_token:
            raise HTTPException(status_code=400, detail="No access token in provider response")

        # Fetch user info
        if provider == "google":
            ui_resp = await client.get(
                cfg["userinfo_url"],
                headers={"Authorization": f"Bearer {access_token}"},
            )
            ui_resp.raise_for_status()
            ui = ui_resp.json()
            oauth_sub = ui["sub"]
            email = ui["email"]
            display_name = ui.get("name") or email.split("@")[0]
            avatar_url = ui.get("picture")
        else:  # github
            ui_resp = await client.get(
                cfg["userinfo_url"],
                headers={"Authorization": f"Bearer {access_token}", "Accept": "application/json"},
            )
            ui_resp.raise_for_status()
            ui = ui_resp.json()
            oauth_sub = str(ui["id"])
            email = ui.get("email") or await _get_github_email(access_token, client)
            display_name = ui.get("name") or ui.get("login") or email.split("@")[0]
            avatar_url = ui.get("avatar_url")

    # Upsert user in database
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(User).where(
                User.oauth_provider == provider,
                User.oauth_sub == oauth_sub,
            )
        )
        user = result.scalar_one_or_none()
        if user is None:
            user = User(
                id=uuid.uuid4(),
                oauth_provider=OAuthProvider(provider),
                oauth_sub=oauth_sub,
                email=email,
                display_name=display_name,
                avatar_url=avatar_url,
                role=UserRole.starter,
            )
            db.add(user)
        else:
            user.display_name = display_name
            user.avatar_url = avatar_url
        await db.commit()
        await db.refresh(user)

    # Issue JWT and redirect to frontend
    jwt_token = create_access_token(
        user_id=user.id,
        email=user.email,
        display_name=user.display_name,
        avatar_url=user.avatar_url,
    )

    resp = RedirectResponse(url=FRONTEND_URL, status_code=302)
    resp.delete_cookie("oauth_state")
    resp.set_cookie(
        key="access_token",
        value=jwt_token,
        httponly=True,
        samesite="lax",
        max_age=60 * 60 * 24 * 7,  # 7 days
        path="/",
    )
    return resp


# ---------------------------------------------------------------------------
# Current user — protected
# ---------------------------------------------------------------------------

@router.get("/me")
async def get_me(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(select(User).where(User.id == uuid.UUID(current_user.sub)))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found; please log in again")
    owner_uuid = user.id

    # AUTHZ-12: Usage for UI (conversations and collections used vs limit).
    usage: dict
    if user.role == UserRole.administrator:
        usage = {
            "conversations_used": 0,
            "conversations_limit": None,
            "collections_used": 0,
            "collections_limit": None,
        }
    elif user.role == UserRole.pro:
        conv_count = await db.execute(
            select(func.count(Conversation.id)).where(Conversation.owner_id == owner_uuid)
        )
        coll_count = await db.execute(
            select(func.count(Collection.id)).where(Collection.owner_id == owner_uuid)
        )
        usage = {
            "conversations_used": conv_count.scalar() or 0,
            "conversations_limit": PRO_CONVERSATION_LIMIT,
            "collections_used": coll_count.scalar() or 0,
            "collections_limit": PRO_COLLECTION_LIMIT,
        }
    else:
        # Starter: use lifetime counts and starter limits
        usage = {
            "conversations_used": user.lifetime_conversations_created or 0,
            "conversations_limit": STARTER_CONVERSATION_LIMIT,
            "collections_used": user.lifetime_collections_created or 0,
            "collections_limit": STARTER_COLLECTION_LIMIT,
        }

    return {
        "id": current_user.sub,
        "email": current_user.email,
        "display_name": current_user.display_name,
        "avatar_url": current_user.avatar_url,
        "role": user.role.value,
        "usage": usage,
    }


# ---------------------------------------------------------------------------
# Logout
# ---------------------------------------------------------------------------

@router.post("/logout")
async def logout() -> dict:
    resp = Response(content='{"ok": true}', media_type="application/json")
    resp.delete_cookie("access_token", path="/")
    return resp  # type: ignore[return-value]


# ---------------------------------------------------------------------------
# Delete account
# ---------------------------------------------------------------------------

@router.delete("/account", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(current_user: CurrentUser) -> Response:
    from app.database import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        await db.execute(delete(User).where(User.id == uuid.UUID(current_user.sub)))
        await db.commit()

    resp = Response(status_code=status.HTTP_204_NO_CONTENT)
    resp.delete_cookie("access_token", path="/")
    return resp
