# 15 — Docker and CI/CD

This document defines how the project is containerized (Docker), how local multi-service execution works (docker-compose), and how automated quality gates run in CI (lint/test/build). The goal is to ensure:

- **Reproducible builds** (same output regardless of machine)
- **Fast onboarding** for reviewers (single command to run)
- **Safe defaults** (no secrets baked into images; API key remains in-memory only)
- **Clear quality gates** (format/lint/typecheck/tests/build in CI)
- **Simple, non-overengineered delivery** aligned with the assessment scope

---

## 15.1 Dockerfiles (frontend / backend / monorepo)

### 15.1.1 Guiding Principles
- Use **multi-stage builds** to keep production images small.
- Do **not** bake secrets into images (no `.env` copied).
- The system must accept the user API key at runtime (sent per request), so images should not depend on AI secrets.
- Prefer deterministic dependency installs with a lockfile (e.g., `pnpm-lock.yaml`).
- Make dev/prod behavior explicit via `NODE_ENV` and separate compose profiles if needed.

---

### 15.1.2 Backend Dockerfile (apps/api)
**Target:** Production-grade image for the Node API.

**Key characteristics**
- Multi-stage:
  1) **deps** stage (install deps)
  2) **build** stage (compile TypeScript)
  3) **runtime** stage (run `node dist/...`)
- Only copy required runtime artifacts into final stage:
  - `dist/`
  - `package.json`
  - production `node_modules`
- Use a non-root user if feasible (Node official images often include `node` user).

**Runtime environment expectations**
- Provide config via env vars:
  - `PORT`
  - `MONGO_URI`
  - `CORS_ORIGIN`
  - any `AI_*` config (models/timeouts) but no keys
- The API key is provided at request time, not at container startup.

**Healthcheck**
- Optional but helpful:
  - `HEALTHCHECK` calling `/health`

**Logging**
- Logs go to stdout/stderr in structured format.
- Never log request headers containing the user key.

---

### 15.1.3 Frontend Dockerfile (apps/web)
Two common approaches:

#### Option A — Static build + Nginx (recommended for “demo/prod”)
- Stage 1: build the React app (`pnpm build`)
- Stage 2: serve static files with Nginx
- Advantages:
  - Very small image
  - No Node runtime needed
  - Simpler and robust

Considerations:
- You still need to configure the API base URL.
- Prefer runtime-injected config through:
  - a small `/config.json` served by Nginx (generated at container start)
  - or environment variable substitution in an `env.js` script
For this test, simplest is:
- set `VITE_API_BASE_URL` at build time for the demo image
- and document it clearly

#### Option B — Serve with Node (only if needed)
- Use Node to serve static files
- Usually unnecessary for a Vite-built SPA

---

### 15.1.4 Monorepo Docker Strategy
Two paths:

#### Path 1 — Separate images (web + api)
- `apps/api/Dockerfile`
- `apps/web/Dockerfile`
- `docker-compose.yml` orchestrates them
- Best for clarity and separation

#### Path 2 — Single “monorepo” Dockerfile (optional)
- Build both apps in one Dockerfile
- Final output might still be two processes (which is less ideal in one container)
- Not recommended unless you also add a process manager; that’s overkill for the test

**Recommendation:** separate images.

---

### 15.1.5 Development Containers (optional)
You can add a dev-oriented Dockerfile/compose profile if you want.
But do not sacrifice simplicity:
- local dev is already good with `pnpm dev`
- Docker dev is optional

---

## 15.2 docker-compose for dev and for demo

### 15.2.1 Goals for Compose
- Provide a **single command** to run the whole stack:
  - `docker compose up --build`
- Make ports obvious and stable.
- Support both:
  - **dev** (hot reload, bind mounts)
  - **demo** (production builds)
- Avoid unnecessary services (no extra DB containers, since DB is remote/read-only).

---

### 15.2.2 Compose: Services Overview
Minimum services:
- `api`
- `web`

Optional (only if justified):
- `reverse-proxy` (usually unnecessary locally)
- `otel-collector` (overkill for the test)

---

### 15.2.3 Compose for “Demo / Production-like” Mode
**Characteristics**
- Uses production images (or builds them from Dockerfiles).
- No bind mounts.
- `web` serves static build (Nginx).
- `api` runs compiled JS.

**Ports**
- `web`: `http://localhost:8080` (or 3000)
- `api`: `http://localhost:4000`

**Environment**
- `api` gets:
  - `MONGO_URI` (read-only)
  - `CORS_ORIGIN` set to web origin
  - `NODE_ENV=production`
- `web` uses build-time API base URL OR runtime config approach.

**Networking**
- Both services on the same compose network.
- `web` calls `api` via:
  - `http://api:4000` inside docker network, OR
  - `http://localhost:4000` if you keep API published

---

### 15.2.4 Compose for “Dev” Mode (Optional)
If you implement a dev compose:

**Characteristics**
- bind mount source into containers
- use a watch runner (`tsx watch`, `nodemon`, etc.)
- install dependencies inside container (or mount node_modules strategy)

**Potential complexity warning**
Dev compose is nice, but it can become a time sink. For the assessment, it’s often enough to:
- have `pnpm dev` as the primary dev path
- have `docker compose up` as the demo/prod path

---

### 15.2.5 Compose Profiles (Clean Separation)
Use compose profiles:
- `demo` profile: production-like
- `dev` profile: hot reload

Example (conceptually):
- `docker compose --profile demo up --build`
- `docker compose --profile dev up --build`

This keeps one file with two modes.

---

### 15.2.6 API Key Handling in Compose
Important: the user key is runtime input.
Therefore:
- compose does not need `GEMINI_API_KEY`
- do not include any `AI_API_KEY` env vars
- the user enters the key in the UI and it’s sent per request

---

## 15.3 CI Pipeline (lint / test / build)

### 15.3.1 CI Goals
CI should catch:
- formatting drift
- type errors
- failing tests
- build breakage

And should be:
- **fast**
- **deterministic**
- **not dependent on external services**
  - no Mongo requirement by default
  - no Gemini key required

---

### 15.3.2 Recommended CI Stages
A simple pipeline (e.g., GitHub Actions) might run:

1) **Checkout**
2) **Setup Node + pnpm**
3) **Install**
   - `pnpm install --frozen-lockfile`
4) **Lint**
   - `pnpm lint`
5) **Typecheck**
   - `pnpm typecheck`
6) **Test**
   - `pnpm test`
7) **Build**
   - `pnpm build`

Optional:
- **Docker build check**
  - build `apps/api` and `apps/web` images to ensure Dockerfiles don’t break
  - do not push anywhere for the assessment

---

### 15.3.3 Test Strategy in CI (No External Dependencies)
Ensure that:
- unit tests mock Mongo access
- AI provider calls are stubbed/mocked

If you include integration tests that talk to the real Mongo cluster:
- keep them in a separate job that is **not** required
- or run them only when explicitly enabled (manual workflow dispatch)

---

### 15.3.4 Caching
Use caching for faster runs:
- pnpm store cache (`~/.pnpm-store`)
- node modules caching (optional; pnpm store is often enough)

---

### 15.3.5 CI Output and Artifacts (Optional)
If you generate build artifacts or test reports:
- upload them in CI (optional)
- keep it minimal to avoid noise

---

## 15.4 Versioning, Tags, and Releases

### 15.4.1 Repository Versioning Strategy
For an assessment repo, keep it simple:

- Use **semantic versioning** tags if you want (`v0.1.0`, `v0.2.0`).
- Or just rely on git commits + CHANGELOG entries.

What matters most is:
- clarity in `CHANGELOG.md`
- stable commands
- reproducibility

---

### 15.4.2 Tagging Milestones
Recommended tags (optional):
- `v0.1.0` — baseline scaffolding (web + api + docs + basic endpoints)
- `v0.2.0` — working matching pipeline end-to-end
- `v0.3.0` — admin controls + evaluation hooks
- `v1.0.0` — final submission

---

### 15.4.3 Release Notes vs CHANGELOG
Since the assessment explicitly asks for `CHANGELOG.md`, treat that as the primary “release notes”.

If you create GitHub releases:
- generate them from CHANGELOG entries
- keep them concise and aligned with reviewer needs

---

### 15.4.4 Build Metadata (Optional)
You can include lightweight build metadata:
- commit hash in API `/health` response
- frontend build version displayed in footer (optional)
This helps debugging and shows polish.

---

## 15.5 PR Pattern, Code Review, and Quality Standards

### 15.5.1 PR Discipline (Even in a Solo Repo)
Even if you’re the only contributor, using PR-like discipline improves traceability:

- small commits with clear messages
- each logical milestone grouped:
  - “setup monorepo”
  - “add search endpoint”
  - “add Gemini integration”
  - “add reranker”
  - “add admin settings”
- write CHANGELOG entries as you go

---

### 15.5.2 Conventional Commits (Recommended)
Use:
- `feat: ...`
- `fix: ...`
- `docs: ...`
- `chore: ...`
- `test: ...`
- `refactor: ...`

This makes the changelog and review history easier.

---

### 15.5.3 Code Review Checklist (What Reviewers Expect)
Even without a real review process, enforce these standards:

**API**
- routes have validation
- errors use stable codes
- requestId correlation present

**AI**
- prompt outputs validated via schema
- model calls are timeboxed + retried
- logs sanitized

**Mongo**
- read-only behavior
- query projections (don’t fetch huge docs)
- avoid full collection scans when possible

**Frontend**
- clear states (loading/error/empty)
- accessible basics (labels, keyboard focus)
- no secrets stored

**Docs**
- README has “run locally” instructions that work
- CHANGELOG explains major decisions and prompt evolution

---

### 15.5.4 Required Quality Gates Before Merge/Tag
Before tagging the final version, ensure:
- `pnpm lint` passes
- `pnpm typecheck` passes
- `pnpm test` passes
- `pnpm build` passes
- `docker compose up --build` works in demo mode

---

## Expected Outcome
After this Docker + CI/CD plan is implemented, a reviewer can:

- run the project locally without needing anything besides Node/pnpm (or Docker)
- build and run with Docker in a production-like setup
- trust CI results for code quality and build stability
- understand project evolution via tags + changelog
- see evidence of senior-level engineering rigor without unnecessary complexity