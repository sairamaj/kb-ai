#!/usr/bin/env python3
"""
Change a user's role by email.

Run from backend directory:
  python scripts/set_user_role.py <email> <role>

When run on your machine (not in Docker), the script uses localhost instead of
host "db" so it connects like psql. Set DATABASE_HOST to override the host.

Roles: administrator, pro, starter
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys

# Ensure app is importable when run as script from backend or repo root
_backend = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _backend not in sys.path:
    sys.path.insert(0, _backend)

# Load .env from backend dir if present (same as the app)
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(_backend, ".env"))
except ImportError:
    pass

# When run on host (not in Docker), "db" hostname does not resolve. Use localhost when
# DATABASE_URL is unset or when it uses host "db" (typical in .env for Docker).
import re
url = os.environ.get("DATABASE_URL", "postgresql+asyncpg://kb_user:kb_password@localhost:5432/kb_db")
if os.environ.get("DATABASE_HOST"):
    url = re.sub(r"@[^:/]+", f"@{os.environ['DATABASE_HOST']}", url, count=1)
elif "@db:" in url or "@db/" in url:
    url = re.sub(r"@db([:/])", r"@localhost\1", url)
os.environ["DATABASE_URL"] = url

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models import User, UserRole


def main() -> None:
    roles = [r.value for r in UserRole]
    parser = argparse.ArgumentParser(
        description="Set a user's role by email.",
        epilog=f"Valid roles: {', '.join(roles)}",
    )
    parser.add_argument("email", help="User email (exact match)")
    parser.add_argument("role", choices=roles, help="New role")
    args = parser.parse_args()

    async def run() -> None:
        async with AsyncSessionLocal() as session:
            result = await session.execute(select(User).where(User.email == args.email))
            user = result.scalar_one_or_none()
            if not user:
                print(f"User not found: {args.email}", file=sys.stderr)
                sys.exit(1)
            user.role = UserRole(args.role)
            await session.commit()
            print(f"Updated {user.email} (id={user.id}) to role: {user.role.value}")

    asyncio.run(run())


if __name__ == "__main__":
    main()
