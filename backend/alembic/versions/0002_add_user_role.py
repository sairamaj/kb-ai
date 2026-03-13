"""add user role (AUTHZ-01)

Revision ID: 0002a
Revises: 0002
Create Date: 2026-03-13

"""
from typing import Sequence, Union

from alembic import op


revision: str = "0002a"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create enum type if it does not already exist
    op.execute(
        """
        DO $$ BEGIN
            CREATE TYPE user_role_enum AS ENUM ('administrator', 'pro', 'starter');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
        """
    )

    # Add column to users table (IF NOT EXISTS for idempotency)
    op.execute(
        """
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS role user_role_enum NOT NULL DEFAULT 'starter'::user_role_enum
        """
    )


def downgrade() -> None:
    op.drop_column("users", "role")
    op.execute(
        """
        DO $$ BEGIN
            DROP TYPE user_role_enum;
        EXCEPTION WHEN undefined_object THEN NULL;
        END $$
        """
    )

