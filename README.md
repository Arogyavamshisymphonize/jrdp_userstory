# Multi-Provider LLM Agent

Bring-your-own-key LLM agent (OpenAI, Anthropic, Gemini, Mistral) with per-user system prompt patches.
FastAPI + PostgreSQL (Supabase) backend, React + TypeScript UI (Vite).

This application lets each user connect their own OpenAI, Anthropic, Gemini or Mistral API key (stored with envelope encryption, never shown again), pick any model that key can use, and run prompts through one common interface. Every user gets a fixed, protected base prompt (Role, Safety & Compliance) that an admin controls, plus a personal patch to the editable sections (Rules, Output Format, Behaviour) with validation, diffs, versioning and revert. Unsafe edits are rejected on save, and answers that leak the protected instructions are withheld, so teams can let people tailor an assistant to their own work without being able to switch off the guardrails. Every run is audited with a correlation ID, which makes it suited to internal AI assistants, bring-your-own-key tools, provider comparison and prompt experimentation.

## Quick start

Needs Python 3.12, [uv](https://docs.astral.sh/uv/), Node 24 and a Supabase project. The only database is Supabase (PostgreSQL).

    git clone https://github.com/rahulsymphonize/JRDP_Userstory.git
    cd JRDP_Userstory
    uv sync
    copy .env.example .env             & rem DATABASE_URL = Supabase session pooler URL, KEKS, AUTH_MODE=dev, ADMIN_USERS=admin
    uv run python -m src.manage gen-kek  & rem paste as KEKS=dev:<output>
    uv run python -m src.manage migrate
    uv run uvicorn app:app --reload --port 8000

In a second terminal, the UI:

    cd frontend
    npm install
    npm run dev                        & rem http://localhost:5173, proxies /api to :8000

`.env` is read automatically (real environment variables win). The API docs are at http://localhost:8000/docs.
The UI defaults to dev sign-in (any user ID; `admin` sees the admin tools). Build it with `VITE_AUTH_MODE=oidc` to
ask for a bearer token instead.

## Run

Production-shaped stack (against Supabase):

    docker compose up --build      # migrate -> app on http://localhost:8000 (API + the React build, one origin)

Backend tests need a throwaway PostgreSQL: they drop and recreate the `public` schema, so they refuse to run against Supabase.

    docker compose --profile local-db up -d db
    set TEST_DATABASE_URL=postgresql+psycopg://agent:agent@localhost:5432/agent
    uv run pytest -q

UI checks (from `frontend/`): `npm run lint`, `npm test` (Vitest + Testing Library), `npm run build` (type-checks).

## Supabase notes

- Use the **session pooler** connection string (port 5432, IPv4). The transaction pooler (6543) breaks prepared statements.
- Migration `0004` enables row level security on every table with no policies, so Supabase's Data API (anon key)
  sees nothing. The app connects as the table owner and is unaffected.
- `DB_POOL_SIZE` (default 5) is per worker; keep `workers x (pool + 5)` under your Supabase pooler limit.

## Deploying (Render, free plan)

One web service runs everything: the Docker image builds the React UI and the API serves it, so UI and API share
an origin (no CORS, no proxy). The database stays on Supabase. [`render.yaml`](render.yaml) is the blueprint.

1. Push the repo to GitHub/GitLab, then in Render: **New > Blueprint**, pick the repo.
2. Fill in the values it asks for: `DATABASE_URL` (Supabase session pooler), `KEKS` (a **new** key from
   `uv run python -m src.manage gen-kek`, kept somewhere safe: losing it makes stored API keys unreadable),
   `OIDC_ISSUER`, `OIDC_AUDIENCE`, `OIDC_JWKS_URL`, `ADMIN_USERS`.
3. Deploy. On start the service runs `python -m src.manage migrate` (migrations, provider list, base prompt),
   then the API. Render's health check calls `/readyz`. Every push to the branch redeploys.

Render terminates TLS. The API will not start without a PostgreSQL `DATABASE_URL` and `KEKS`; with
`APP_ENV=production` it also needs OIDC auth, and `/docs` is off. Free instances sleep after ~15 minutes idle;
the first request after that takes about a minute.

Elsewhere: build the `Dockerfile`, run `python -m src.manage migrate` before each new version, start the image
(it listens on `$PORT`, default 8000) behind TLS. Probes: `/healthz` (liveness), `/readyz` (database reachable).

## Operations

- **Change the base prompt:** edit `src/base_prompt.json` and deploy, or run
  `python -m src.manage publish-base FILE`. Users whose patch no longer applies are flagged and get the
  base prompt until they apply their edits again or reset.
- **Rotate the encryption key:** run `manage gen-kek`, add the new key at the front of `KEKS`
  (`new:key,old:key`), deploy, then run `manage rewrap`. Once rewrap finishes, the old key can be removed.
- **Move to a managed KMS:** replace the bodies of `wrap_dek` / `unwrap_dek` in `src/components/key_vault.py`.
- **Trace a request:** every response and error body carries `correlationId`. It is also in the JSON logs
  and in `execution_audit.correlation_id`. `GET /api/v1/admin/audit/{id}` returns the run with its task and
  response text (secrets redacted, capped at 20,000 characters), including responses withheld as `OUTPUT_BLOCKED`.
  Base prompt versions record `published_by` (admin user id, or `cli`).

## Layout

- `app.py`: REST API (`/api/v1/...`), error format, correlation IDs. Routes call pipelines and components
- `src/pipeline/`: `execution_pipeline.py` (one run, leak check, audit), `prompt_pipeline.py` (preview, apply, diff, revert, reset)
- `src/components/`:
  - `llm_providers.py`: one adapter per provider, key format checks, provider error mapping
  - `prompt_manager.py`: patch build/validate/apply, diff, versioning
  - `guardrails.py`: unsafe-edit patterns and the output leak check
  - `key_vault.py`: envelope encryption (per-key AES-GCM data key, wrapped by a KEK)
  - `credential_store.py`, `model_catalog.py`: stored keys, cached model lists, model preference
  - `auth.py`: OIDC JWT verification via JWKS (`sub` = user id)
  - `database.py` + `src/migrations/`: schema and Alembic migrations
- `src/entity/`: request bodies (`config_entity.py`) and pipeline results (`artifact_entity.py`)
- `src/constants/` (settings from env/.env), `src/exceptions/` (`AppError`), `src/logger/` (JSON logs, redaction), `src/utils/` (rate limits)
- `src/manage.py`: deploy-time commands
- `frontend/`: React + TypeScript UI (Vite)
  - `src/pages/`: one screen each: sign in, run prompts, my prompt, version history, API keys & models, admin base prompt, audit log
  - `src/components/`: layout, page header, alerts, badges, diff view, icons
  - `src/api/`: typed API client (`client.ts`) and response types (`types.ts`); `src/hooks/useApi.ts`: GET with reload
  - `src/context/session.ts`: signed-in user, effective prompt, this session's runs
  - built into `frontend/dist` by the root `Dockerfile` and served by `app.py`

## Prompt safety

Protected text is admin-only: users never receive it from the API. Admins are the user IDs in `ADMIN_USERS`
(comma-separated OIDC `sub` values). They can view and publish the protected sections (`GET/PUT /api/v1/admin/base-prompt`)
and trace a run by correlation ID (`GET /api/v1/admin/audit/{id}`). Users can diff any two of their saved versions
(`GET /api/v1/users/me/system-prompt/patches/diff?a=1&b=2`).

Users can edit Rules, Output Format and Behaviour, never the protected sections (Role, Safety & Compliance).
Three layers keep a user's edits from switching the protected rules off:

1. **On save:** edits that try to disable the rules, mention a protected section, or ask for the prompt itself
   are rejected (`UNSAFE_CONTENT`). Revert re-runs this check, so old versions can't bring rejected text back.
2. **In the prompt:** when a patch is active, the protected rules are repeated at the end, with a note that they win
   over anything above.
3. **On the answer:** if a model's output copies 6+ consecutive words of a protected section, it is withheld
   (`OUTPUT_BLOCKED`) and the run is audited with that status. This is the backstop. Layers 1 and 2 alone were
   bypassed by a reworded instruction against real Gemini in QA; layer 3 stopped it.

## Error codes worth knowing

| Code | Meaning |
|---|---|
| `INVALID_KEY` (422) | The provider rejected the key itself. Only this marks a stored key Invalid. |
| `MODEL_ACCESS_DENIED` (403) | The key works but can't use this model. |
| `MODEL_NOT_IN_PLAN` (403) | The model has no allowance on your plan (e.g. not on Gemini's free tier). |
| `MODEL_UNAVAILABLE` (404) | The provider doesn't serve this model (any more). |
| `PROVIDER_REJECTED` (400) | The provider refused this request on this model; retrying won't help. |
| `QUOTA_EXCEEDED` / `RATE_LIMITED` (429) | Out of quota, or slow down. |
| `PROVIDER_UNAVAILABLE` (502) | Outage or timeout (120 s). Retry later. |
| `OUTPUT_BLOCKED` (422) | The answer revealed protected instructions and was withheld. |

## Known limits

- The model cache and rate limits are per process. With many instances, each one enforces its own limit.
  Move them to Redis or the gateway if that matters.
- The input check is a keyword list and the output check catches copied text, not loose paraphrases. Add a
  moderation model if that matters for your users.
- Model lists come from the providers. A listed model can still be refused at run time (e.g. Gemini models
  retired for new users); the run then fails with `MODEL_UNAVAILABLE`.
- Only Gemini has been run against the real provider. OpenAI, Anthropic and Mistral adapters are tested with
  mocks and real key-rejection calls only.
- The Docker files have not been built yet.
- Token counts for context checks are estimated (about 4 characters per token).
- The UI asks for a pasted access token in production. It has no OAuth login flow.
- "Your recent runs" on the run page covers this browser session only; the API has no per-user run history.
