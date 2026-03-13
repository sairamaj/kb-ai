### Auth API — current user

`GET /api/auth/me` (requires authenticated cookie) returns the current user:

- **id** (string) — user UUID
- **email** (string)
- **display_name** (string)
- **avatar_url** (string | null)
- **role** (string) — one of `administrator`, `pro`, `starter`

Unauthenticated requests receive 401; no role is returned.

#### Changing a user's role

From the **backend** directory, run:

```powershell
python scripts/set_user_role.py <email> <role>
```

Roles: `administrator`, `pro`, `starter`. Example:

```powershell
python scripts/set_user_role.py admin@example.com administrator
```

When run on your machine (not in Docker), the script uses `localhost:5432` by default so it connects like `psql`. If you use a `backend/.env` that has `DATABASE_URL` with host `db`, set `DATABASE_HOST=localhost` before running the script. Ensure the DB is reachable (e.g. `docker-compose up`).

---

### Viewing the database data

This project uses PostgreSQL running in Docker, configured via `docker-compose.yml` and `backend/.env`.

- **Host**: `localhost`
- **Port**: `5432`
- **Database**: `kb_db`
- **User**: `kb_user`
- **Password**: `kb_password`

#### 1. Start the stack

From the repo root:

```powershell
docker-compose up
```

Use `docker-compose up -d` to run in the background.

#### 2. Connect with `psql` from your machine

If the PostgreSQL client is installed:

```powershell
psql "postgresql://kb_user:kb_password@localhost:5432/kb_db"
```

Then, for example:

```sql
\dt;
SELECT * FROM users LIMIT 10;
SELECT * FROM conversations LIMIT 10;
SELECT * FROM messages LIMIT 10;
```

#### 3. Connect from inside the DB container

First, find the DB container name:

```powershell
docker ps
```

Then exec into it (replace `<db_container_name>` accordingly):

```powershell
docker exec -it <db_container_name> psql -U kb_user -d kb_db
```

The same `\dt` and `SELECT` queries work there as well.

* Install
  ```cmd
  choco install postgresql --params '/Password:postgres'
  ```