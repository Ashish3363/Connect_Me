"""Promote an existing user (by email) to admin.

Usage:
    uv run python scripts/promote_admin.py user@example.com
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

# Allow `python scripts/promote_admin.py` to find the `app` package.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select  # noqa: E402

from app.core.enums import UserRole  # noqa: E402
from app.db.session import AsyncSessionLocal  # noqa: E402
from app.models.user import User  # noqa: E402


async def _main(raw_email: str) -> int:
    email = raw_email.strip().lower()
    if "@" not in email:
        print(f"error: '{raw_email}' is not a valid email", file=sys.stderr)
        return 2

    async with AsyncSessionLocal() as session:
        user = await session.scalar(select(User).where(User.email == email))
        if user is None:
            print(
                f"error: no user with email {email} — they must sign up first",
                file=sys.stderr,
            )
            return 1
        if user.role == UserRole.ADMIN:
            print(f"already admin: {email}")
            return 0
        user.role = UserRole.ADMIN
        await session.commit()
        print(f"promoted to admin: {email}")
        return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("usage: promote_admin.py <email>", file=sys.stderr)
        sys.exit(2)
    sys.exit(asyncio.run(_main(sys.argv[1])))
