"""user last_accessed_at and visit_count (REP-04, REP-05)

Revision ID: 0007
Revises: 0006
Create Date: 2026-03-14

REP-04: last_accessed_at — updated when user performs authenticated action (e.g. /auth/me).
REP-05: visit_count — incremented on each OAuth login.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0007"
down_revision: Union[str, None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("last_accessed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("visit_count", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("users", "visit_count")
    op.drop_column("users", "last_accessed_at")
