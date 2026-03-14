"""add user lifetime_collections_created (AUTHZ-10)

Revision ID: 0006
Revises: 0005
Create Date: 2026-03-13

Starter users have a lifetime cap on collections created; this column
tracks the count (incremented on create, never decremented on delete).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("lifetime_collections_created", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("users", "lifetime_collections_created")
