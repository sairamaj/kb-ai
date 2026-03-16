# Multi-stage backend Dockerfile: use --target prod for production, --target dev for dev.
# Default target is prod (no --reload).
FROM python:3.12-slim AS base

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Development: run migrations and uvicorn with --reload
FROM base AS dev
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"]

# Production: run migrations and uvicorn without --reload (App Service–ready)
FROM base AS prod
EXPOSE 8000
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
