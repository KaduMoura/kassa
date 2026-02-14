# 14 — Developer Experience (DevEx), Build, and Local Execution

This document defines how the repository should be run locally, how builds are produced, and what conventions enable a smooth day-to-day developer workflow. The goal is to make the project:

- **one-command runnable** (or close to it)
- **easy to debug** (clear logs, predictable ports)
- **safe by default** (no secrets committed, API key in-memory only)
- **consistent across environments** (dev vs prod behavior is explicit)
- **friendly to AI coding tools** (clear scripts, strong boundaries, minimal hidden magic)

This is especially important for the assessment, because reviewers will often judge the project by how quickly they can:
1) clone
2) run locally
3) test a few scenarios
4) understand how things fit together

---

## 14.1 Scripts and Commands (dev / build / start)

### 14.1.1 Monorepo Assumptions
Recommended monorepo layout (already described in Topic 00):
- `apps/web` (React + TypeScript)
- `apps/api` (Node.js + TypeScript)
- `docs/` (the markdown plan documents)
- root scripts orchestrate both apps

Use a workspace package manager (preferably **pnpm**) to keep installs fast and deterministic.

---

### 14.1.2 Root-Level Commands (Single Entry Point)
At the repository root, define commands that work for a reviewer immediately:

#### `pnpm install`
Installs dependencies for all packages.

#### `pnpm dev`
Runs both frontend and backend in watch mode:
- starts `apps/api` on a known port (e.g. `4000`)
- starts `apps/web` on a known port (e.g. `5173`)
- prints both URLs clearly to stdout

Implementation options:
- `concurrently`
- `turbo`
- `nx`
Keep it simple: `concurrently` is usually enough for this test.

---

### 14.1.3 Backend Commands
In `apps/api/package.json`:

- `pnpm dev`  
  Runs the API in watch mode (`tsx watch`, `nodemon`, or `ts-node-dev`).

- `pnpm build`  
  Type-check + compile TS to `dist/`.

- `pnpm start`  
  Runs compiled output:
  - `node dist/index.js`

- `pnpm test`  
  Runs unit + integration tests for backend.

- `pnpm typecheck`  
  Runs `tsc --noEmit`.

- `pnpm lint` / `pnpm format`
  Runs ESLint / Prettier.

---

### 14.1.4 Frontend Commands
In `apps/web/package.json`:

- `pnpm dev`  
  Runs Vite dev server.

- `pnpm build`  
  Builds the production bundle.

- `pnpm preview`  
  Serves built bundle locally (optional but useful for reviewers).

- `pnpm test`  
  Runs UI tests (if implemented).

- `pnpm typecheck` / `pnpm lint` / `pnpm format`
  Standard checks.

---

### 14.1.5 CI-Friendly Commands
Ensure CI can run:
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`

And these do **not** require:
- external API keys
- access to the MongoDB cluster (unless specifically configured)

If Mongo access is required for some integration tests, provide:
- a separate script like `pnpm test:integration:real`
- keep default `pnpm test` fully offline

---

### 14.1.6 Recommended Port Conventions
Use stable, predictable ports:
- `apps/api`: `http://localhost:4000`
- `apps/web`: `http://localhost:5173`

Avoid random ports to reduce setup confusion.

---

### 14.1.7 “One Command Demo” (Optional but Strong)
Add:
- `pnpm demo`
which:
- builds both apps
- starts backend + serves frontend (or uses docker compose)
This is a convenience for reviewers and a strong DX signal.

---

## 14.2 Environment Variables and Templates (`.env.example`)

### 14.2.1 Principles
- No real `.env` committed
- Provide `.env.example` at:
  - root (for orchestrating)
  - or per app (`apps/api/.env.example`, `apps/web/.env.example`)
- Minimal required variables
- Clear defaults for local mode where possible

---

### 14.2.2 Backend Environment Variables
**MongoDB (read-only)**
- `MONGO_URI`  
  Use the provided connection string in local dev config by default, or require it explicitly.

**Server**
- `PORT=4000`
- `NODE_ENV=development|production|test`

**CORS**
- `CORS_ORIGIN=http://localhost:5173`
- allow comma-separated origins if needed

**Admin Protection**
- `ADMIN_TOKEN=...` (optional simple gate)
- `ADMIN_ENABLED=true|false`

**Limits**
- `MAX_UPLOAD_BYTES=10485760` (10MB)
- `REQUEST_TIMEOUT_MS=30000`

**AI Provider Settings**
Even though the user supplies the API key at runtime, the backend still may need:
- `AI_PROVIDER=gemini`
- `GEMINI_MODEL_VISION=gemini-2.5-flash`
- `GEMINI_MODEL_RERANK=gemini-3-flash-preview`
- `AI_TIMEOUT_MS=12000`
- `AI_RETRY_MAX=1`

**Testing Mode**
- `TEST_MODE=stubbed|real`
Default should be `stubbed` in CI.

---

### 14.2.3 Frontend Environment Variables
Frontend should be able to run without secrets.

Typical variables:
- `VITE_API_BASE_URL=http://localhost:4000`
- `VITE_ADMIN_ENABLED=true|false` (optional UI gating)

Do **not** put any AI API key variable here; the user enters it at runtime in the UI.

---

### 14.2.4 `.env.example` Content and Commentary
Your `.env.example` should include:
- all variables your app reads
- safe defaults
- short comments

Example style (for docs only; actual file in repo):
- `# MongoDB read-only connection (required for real DB mode)`
- `# CORS origin for local frontend`

Keep comments helpful but not long.

---

### 14.2.5 Local vs Production Behavior (Explicit)
Document in the `.env.example` and README:
- in dev, logs are verbose
- in prod, logs are structured and sanitized
- CORS is strict in prod mode

---

## 14.3 Local “Golden Set” Seed (If Applicable)

This section applies if you implement a “lightweight evaluation mechanism” (Topic 10) that can run locally.

### 14.3.1 What “Golden Set” Means Here
A **golden set** is a small curated collection of test cases used to evaluate matching quality.

Each test case typically includes:
- an image file (or reference)
- optional prompt text
- optional “expected” category/type or a list of acceptable IDs
- notes on what “good” looks like

---

### 14.3.2 Storage Strategy (Local Only)
Since the product DB is read-only, the golden set should live in the repo:

- `apps/api/test/golden-set/`
  - `cases.json`
  - `images/`
  - `README.md` (how to run)

Or in `docs/golden-set/`.

Important:
- keep images small and non-sensitive
- do not include proprietary or personal photos

---

### 14.3.3 Running Golden Set Evaluation Locally
Provide a script (optional but valuable):
- `pnpm eval:golden`
that:
1) loads `cases.json`
2) runs the pipeline in stubbed or real mode
3) prints summary metrics:
   - hit@K
   - MRR (if you define a target item)
4) writes a local report:
   - `apps/api/.local/eval-report.json` (gitignored)

This is optional, but if included, it shows strong engineering maturity.

---

### 14.3.4 “No Surprises” Principle
Golden set evaluation should:
- never require writing to DB
- never require storing the user API key
- be clearly separated from normal app usage

---

## 14.4 Local Setup Troubleshooting

This section is about reducing reviewer friction. It should read like a checklist a reviewer can follow if something fails.

---

### 14.4.1 Common Setup Issues and Fixes

#### A) Node version mismatch
Symptoms:
- build errors
- dependency install issues

Fix:
- specify required node version in:
  - `.nvmrc` or `.node-version`
  - `engines` field in root `package.json`
- document: “Use Node X+”

---

#### B) Mongo connection fails
Symptoms:
- backend logs show connection timeout / auth failure
- search returns “DB unavailable”

Likely causes:
- network restrictions
- incorrect connection string in `.env`

Fix steps:
1) verify `MONGO_URI`
2) try a simple “health check” endpoint:
   - `/api/health`
3) provide fallback:
   - `TEST_MODE=stubbed` for running without Mongo

---

#### C) CORS errors in browser
Symptoms:
- frontend shows network error
- console mentions CORS blocked

Fix steps:
1) check `CORS_ORIGIN`
2) ensure frontend `VITE_API_BASE_URL` matches backend
3) confirm backend is running on expected port

---

#### D) Upload errors (413 / 400)
Symptoms:
- “File too large”
- “Invalid image type”

Fix steps:
- try smaller JPEG/PNG
- confirm allowed types
- ensure `MAX_UPLOAD_BYTES` is set

---

#### E) AI provider errors (401/403/429/timeout)
Symptoms:
- “Invalid key”
- “Rate limited”
- “Timeout”

Fix steps:
- confirm API key is correct
- reduce concurrency (don’t spam requests)
- adjust:
  - `AI_TIMEOUT_MS`
  - `AI_RETRY_MAX`
- try heuristic-only mode in Admin (disable rerank)

---

### 14.4.2 Debugging Conventions
To help debugging:
- always print `requestId` to UI (or copy button)
- backend logs include requestId
- errors have stable `error.code`

Recommended workflow:
1) user copies `requestId`
2) developer finds matching logs
3) inspect stage timings and fallbacks

---

### 14.4.3 “Known Limitations” (Explicit)
Document any non-issues that might look like bugs:
- AI outputs are probabilistic
- some images will be ambiguous
- database is read-only and may not have perfect coverage
- strict matching may fail; fallbacks will broaden search

This reduces confusion and shows awareness.

---

## Expected Outcome
After following this DevEx plan, a reviewer should be able to:

1) clone the repo  
2) run `pnpm install && pnpm dev`  
3) open the app in the browser  
4) paste an API key at runtime  
5) upload an image and get ranked results  
6) tweak admin parameters and see behavior change  
7) run tests and CI checks without external dependencies  

All while keeping secrets safe and behavior predictable across environments.