# One image: the React UI is built here and served by the API, so they share an origin (no CORS, no proxy).
FROM node:24-alpine AS ui
WORKDIR /ui
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ .
# Baked into the UI at build time (public values only). Render passes service env vars as build args.
# supabase: email + password via Supabase Auth (API: AUTH_MODE=oidc); dev: any user id (API: AUTH_MODE=dev).
ARG VITE_AUTH_MODE=supabase
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_AUTH_MODE=$VITE_AUTH_MODE VITE_SUPABASE_URL=$VITE_SUPABASE_URL VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
RUN npm run build

FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY alembic.ini .
COPY app.py .
COPY src src
COPY --from=ui /ui/dist frontend/dist
RUN useradd --uid 10001 app
USER app
EXPOSE 8000
# Migrate (idempotent: schema, provider list, base prompt), then serve. $PORT is set by Render; 8000 locally.
# ponytail: migrating on start suits one instance; with several, run `python -m src.manage migrate` once per deploy instead
CMD ["sh", "-c", "python -m src.manage migrate && exec uvicorn app:app --host 0.0.0.0 --port ${PORT:-8000} --workers ${WEB_CONCURRENCY:-2} --proxy-headers --forwarded-allow-ips='*' --no-access-log"]
