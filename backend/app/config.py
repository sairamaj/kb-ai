import os

# OAuth providers
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GITHUB_CLIENT_ID = os.getenv("GITHUB_CLIENT_ID", "")
GITHUB_CLIENT_SECRET = os.getenv("GITHUB_CLIENT_SECRET", "")

# JWT
SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_SECONDS = 60 * 60 * 24 * 7  # 7 days

# URLs
# All OAuth redirect URIs go through the Vite proxy so the browser receives
# the Set-Cookie header on localhost:5173 (the same origin as the SPA).
REDIRECT_BASE_URL = os.getenv("REDIRECT_BASE_URL", "http://localhost:5173/api")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
