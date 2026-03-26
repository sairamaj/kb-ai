# Multi-stage frontend Dockerfile: use --target prod for production, --target dev for dev.
# Default target is prod (static build served by nginx).
# Build-time: pass VITE_API_BASE_URL so the app calls the correct backend in production.

# -----------------------------------------------------------------------------
# Build stage: produce static assets with npm run build
# -----------------------------------------------------------------------------
FROM node:22-alpine AS build

WORKDIR /app

# Install deps (include devDependencies for vite and tsc)
COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

# Optional: set at build time so the built JS uses this API base URL (e.g. https://promptkb-api.azurewebsites.net)
ARG VITE_API_BASE_URL=
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

RUN npm run build

# -----------------------------------------------------------------------------
# Production stage: serve static files with nginx (no dev server)
# -----------------------------------------------------------------------------
FROM nginx:alpine AS prod

# Remove default config and use ours (listen 8080, SPA fallback)
RUN rm -rf /usr/share/nginx/html /etc/nginx/conf.d
COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]

# -----------------------------------------------------------------------------
# Development stage: Vite dev server (for docker-compose)
# -----------------------------------------------------------------------------
FROM node:22-alpine AS dev

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

EXPOSE 5173

# Bind mount ./frontend hides image files; /app/node_modules is a persistent volume.
# Run install on each start so new dependencies (e.g. after package.json changes) are applied.
CMD ["sh", "-c", "npm install && npm run dev"]
