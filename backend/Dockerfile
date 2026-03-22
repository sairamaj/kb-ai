# Multi-stage backend Dockerfile: use --target prod for production, --target dev for dev.
# Default target is prod (no --reload).
FROM python:3.12-slim AS base

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Development: run migrations and uvicorn with --reload
FROM base AS dev
CMD ["sh", "-c", "max_attempts=\"${MIGRATION_MAX_ATTEMPTS:-10}\"; sleep_seconds=\"${MIGRATION_SLEEP_SECONDS:-2}\"; attempt=1; success=0; while [ \"$attempt\" -le \"$max_attempts\" ]; do echo \"Running migrations (attempt $attempt/$max_attempts)...\"; if alembic upgrade head; then success=1; break; fi; echo \"Migrations failed; sleeping $sleep_seconds seconds before retry...\"; sleep \"$sleep_seconds\"; attempt=$((attempt + 1)); sleep_seconds=$((sleep_seconds + 1)); done; if [ \"$success\" -ne 1 ]; then echo \"Migrations failed after $max_attempts attempts\"; exit 1; fi; uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"]

# Production: run migrations and uvicorn without --reload (App Service–ready)
FROM base AS prod
EXPOSE 8000
CMD ["sh", "-c", "max_attempts=\"${MIGRATION_MAX_ATTEMPTS:-10}\"; sleep_seconds=\"${MIGRATION_SLEEP_SECONDS:-2}\"; attempt=1; success=0; while [ \"$attempt\" -le \"$max_attempts\" ]; do echo \"Running migrations (attempt $attempt/$max_attempts)...\"; if alembic upgrade head; then success=1; break; fi; echo \"Migrations failed; sleeping $sleep_seconds seconds before retry...\"; sleep \"$sleep_seconds\"; attempt=$((attempt + 1)); sleep_seconds=$((sleep_seconds + 1)); done; if [ \"$success\" -ne 1 ]; then echo \"Migrations failed after $max_attempts attempts\"; exit 1; fi; uvicorn app.main:app --host 0.0.0.0 --port 8000"]
