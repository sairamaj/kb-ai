-- One-off: add users.role for DBs that were already at 0004 before 0002a existed.
-- Safe to run multiple times (IF NOT EXISTS).

DO $$ BEGIN
    CREATE TYPE user_role_enum AS ENUM ('administrator', 'pro', 'starter');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS role user_role_enum NOT NULL DEFAULT 'starter'::user_role_enum;
