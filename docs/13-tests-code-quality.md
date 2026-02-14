# 13 — Tests and Code Quality

This document defines the testing and code quality approach for the Image-Based Product Search application. The goal is not to build an enterprise testing program, but to demonstrate:

- **confidence in core functionality** (upload → AI → Mongo → ranking → results)
- **testability by design** (clear separation of concerns and dependency injection)
- **safe refactoring** (unit tests for scoring/logic)
- **reproducible behavior** (contract tests for API responses)
- **healthy developer experience** (lint/format/type-check + CI gates)

The test approach is pragmatic and aligned with the assessment principles: **KISS, DRY, clean code over clever code**.

---

## 13.1 Test Strategy (Unit / Integration / E2E)

### 13.1.1 Testing Pyramid (Pragmatic)
We use a lightweight “pyramid”:

1) **Unit tests (most)**
- pure logic: scoring, parsing, query building, config validation
- fast, deterministic, no network

2) **Integration tests (some)**
- API routes with mocked dependencies (Gemini + Mongo)
- file upload handling
- end-to-end pipeline behavior under controlled stubs

3) **E2E tests (minimal but meaningful)**
- basic UI flow: upload → search → show results
- admin toggles impacting output
- can run locally with stubbed backend or full stack in docker compose

---

### 13.1.2 What We Must Cover (High Value)
Minimum set to prove quality:
- image upload validation behavior (size/type)
- Stage 1 signal parsing and schema validation behavior
- Mongo candidate query builder logic (confidence thresholds + fallbacks)
- ranking logic (heuristic scoring + combining prompt)
- Stage 2 rerank orchestration behavior (success and failure)
- API response contracts and error codes
- Admin config updates validated and bounded

---

### 13.1.3 Determinism and Flakiness Control
AI calls are non-deterministic and network-dependent. Tests must:
- avoid calling real Gemini in CI
- rely on **stubs/mocks** with stable fixtures
- separate “real provider smoke tests” as optional/manual

Rule:
- All tests in CI should pass **without** external credentials.

---

### 13.1.4 Environment Modes for Testing
Define explicit test modes:
- `TEST_MODE=stubbed` (default for CI)
- `TEST_MODE=real` (manual smoke tests only)

In stubbed mode:
- provider returns deterministic JSON fixtures
- Mongo layer uses in-memory dataset or mocked cursor results

---

## 13.2 Matching Pipeline Tests (Mocks / Stubs)

### 13.2.1 Purpose
The pipeline is the “heart” of the assignment. We must test:

- Orchestration correctness (ordering, fallbacks)
- Data correctness (schemas, mapping, truncation)
- Resilience (timeouts, provider errors, empty candidate sets)
- Config-driven behavior (admin knobs change outputs)

---

### 13.2.2 Dependency Injection / Interfaces (Enabler)
To test well, the pipeline must depend on interfaces, not concrete implementations:

- `VisionProvider` (Gemini 2.5 Flash)
- `RerankProvider` (Gemini 3 Flash Preview)
- `ProductsRepository` (Mongo read-only)
- `ConfigStore` (admin config)
- `Clock` (optional, for deterministic timestamps)
- `Logger` (mockable)

This allows tests to inject stubs.

---

### 13.2.3 Fixture-Driven Testing
Create fixtures in `/test/fixtures/`:

- `visionSignals.valid.json`
- `visionSignals.lowConfidence.json`
- `visionSignals.nonFurniture.json`
- `rerankOutput.valid.json`
- `rerankOutput.malformed.json`
- `products.sample.json` (20–50 catalog-like records)
- `config.defaults.json`
- `config.precisionMode.json`
- `config.recallMode.json`

This makes pipeline tests easy to understand and extend.

---

### 13.2.4 Unit Tests (Core Logic)
#### A) Signal parsing and schema validation
- Given raw provider output:
  - valid JSON passes
  - missing required keys fails
  - wrong types fail
  - unknown extra fields handled consistently (strip or reject)

Expected:
- parse returns typed `VisionSignals`
- errors trigger fallback flags, not crashes

---

#### B) Query builder logic (confidence thresholds)
Test cases:
- high category confidence → apply category filter
- low confidence → avoid hard filters
- prompt contains “sofa” → bias candidate query to sofa-like keywords
- prompt says “not leather” → set a negative constraint for ranking (not DB filtering, unless safe)

Expected:
- generated query object matches plan
- plan selection is explainable and stable

---

#### C) Heuristic scoring behavior
Test:
- category match increases score
- type match increases score
- keyword overlap increases score
- dimension mismatch reduces score when user asks “smaller”
- weighting changes influence ordering

Expected:
- deterministic ordering for the same inputs/config

---

#### D) Rerank input building
Test:
- candidate list truncated to `llmRerankTopM`
- descriptions truncated to `maxDescriptionChars`
- prompt injection protected (no raw admin prompt editing)
- stable template formatting

Expected:
- rerank prompt payload size respects limits

---

### 13.2.5 Integration Tests (Pipeline Orchestration)
Run pipeline end-to-end with stubbed dependencies.

Scenarios:
1) **Happy path**
- Stage 1 success
- Mongo returns N candidates
- Stage 2 success
- output topK matches

2) **Stage 1 failure**
- provider throws timeout
- pipeline falls back to prompt-only or broad retrieval
- Stage 2 still runs or is skipped depending on config

3) **Mongo empty**
- Stage 1 returns strict category/type
- DB returns 0 candidates
- pipeline relaxes filters and tries broad query

4) **Stage 2 failure**
- rerank throws 429/timeout
- pipeline falls back to heuristic ranking only
- response includes flag: `meta.rerankUsed=false`

5) **Malformed provider JSON**
- stage outputs invalid JSON
- schema validation fails
- fallback triggered
- user receives safe error or degraded results

All scenarios should verify:
- response shape
- meta flags (fallbacks, timings presence)
- deterministic output for fixtures

---

### 13.2.6 Golden Set Evaluation Tests (Optional)
If you implement a golden set runner (Topic 10), add a test that:
- loads golden set metadata
- runs pipeline with stubbed provider + in-memory products
- asserts:
  - no crashes
  - metrics computed successfully
This is more of a “system sanity test”.

---

## 13.3 API Tests (Contract)

### 13.3.1 Goal
API contract tests ensure:
- stable request/response shapes
- consistent error codes
- correct status codes
- backward compatibility during refactors

---

### 13.3.2 Contract Coverage (Backend)
At minimum test:

#### `POST /api/search`
- accepts multipart upload
- supports optional prompt field
- validates input types and sizes
- returns a stable response shape

#### `GET /api/config`
- returns current admin config (if allowed)
- rejects if admin disabled or token missing (depending on design)

#### `PUT /api/config`
- validates config payload
- rejects out-of-bounds values
- applies config immediately

---

### 13.3.3 Response Shape Invariants
Define and test invariants:

Success:
```json
{
  "data": {
    "results": [ /* items */ ]
  },
  "error": null,
  "meta": {
    "requestId": "...",
    "timings": { /* ms */ },
    "fallbacks": { /* booleans */ }
  }
}
````

Error:

```json
{
  "data": null,
  "error": { "code": "...", "message": "...", "details": null },
  "meta": { "requestId": "..." }
}
```

Contract tests should assert:

* required keys exist
* `error.code` is stable for known failures
* safe messages do not leak secrets

---

### 13.3.4 Tools and Approach

Use a test runner aligned with Node + TS, such as:

* **Vitest** (fast, modern)
* **Jest** (also fine)

For HTTP tests:

* call route handlers directly if using Fastify (inject)
* or use `supertest` for Express-like frameworks

Mock:

* AI providers
* Mongo repository

Do not require real Mongo cluster or real Gemini key.

---

### 13.3.5 Upload Tests

Include a small test asset:

* `test/assets/sample.jpg` (tiny)
* `test/assets/sample.txt` (invalid)

Test cases:

* missing file → `400 MISSING_FILE`
* wrong mime → `400 INVALID_IMAGE_TYPE`
* too large → `413 FILE_TOO_LARGE` (or 400, but consistent)
* invalid multipart fields → safe error

---

## 13.4 UI Tests (Minimum Viable)

### 13.4.1 Goal

UI tests should validate the critical user journey, without becoming heavy.

Minimum UI testing proves:

* the app is usable
* the workflow works end-to-end against a mocked API
* core states and messages appear correctly

---

### 13.4.2 Recommended UI Test Scope

Use 2–4 high-value tests:

1. **Main flow**

* user selects image
* (optional) enters prompt
* clicks Search
* sees loading
* sees results list with ranks and key fields

2. **Error flow**

* API returns invalid key error
* UI shows correct message and recovery action

3. **Empty results**

* API returns empty results
* UI shows empty state and suggestions

4. **Admin changes behavior (if feasible)**

* user opens Admin
* changes `enableLLMRerank` off
* triggers a search
* sees “rerank disabled” meta badge or behavior change (even minimal)

---

### 13.4.3 Test Approach

Preferred:

* Component tests with **React Testing Library**:

  * deterministic and fast
  * mock fetch

Optional:

* 1 E2E test with Playwright

  * run against dev server + mocked backend
  * but keep it minimal to avoid setup complexity

---

### 13.4.4 Mocking Strategy

Mock API responses using:

* a mock service worker (MSW) or simple fetch mocks

Ensure test coverage includes:

* loading spinner states
* disabled buttons during request
* user-friendly error messages (no raw stack traces)

---

## 13.5 Lint, Format, and CI Checks

### 13.5.1 Code Quality Goals

Code quality checks should enforce:

* consistent formatting
* type safety
* basic best practices
* no unused variables
* no accidental secrets

---

### 13.5.2 Required Checks

Run these locally and in CI:

1. **Type check**

* `tsc --noEmit` for both apps
* strict mode enabled

2. **Lint**

* ESLint with TypeScript rules
* enforce:

  * no `any` without justification (or allow but discourage)
  * no unused vars
  * consistent imports

3. **Format**

* Prettier
* consistent code style across monorepo

4. **Tests**

* `vitest run` (unit + integration)
* UI tests optional but recommended

---

### 13.5.3 CI Pipeline (Minimal)

A minimal CI pipeline on PR/push should run:

* install dependencies
* lint
* typecheck
* unit + integration tests
* build (optional but good)

Example stages:

1. `pnpm lint`
2. `pnpm typecheck`
3. `pnpm test`
4. `pnpm build`

---

### 13.5.4 Pre-Commit and Local Hygiene (Optional)

Optional but nice:

* `lint-staged` + `husky`
* run Prettier and ESLint on changed files
* keep it lightweight to avoid friction

---

### 13.5.5 Secret Scanning (Optional, but strong signal)

Add a minimal check:

* fail CI if `.env` is committed
* provide `.env.example`
* optionally use a simple grep rule to detect patterns like `AIza` / `sk-` (best-effort only)

---

## Expected Outcome

After implementing this plan, the repository will demonstrate:

* confidence in the matching pipeline through deterministic unit/integration tests
* stable backend API behavior enforced by contract tests
* a minimal but effective UI test suite proving the user flow
* consistent code quality via lint/format/typecheck gates
* CI automation proving professional engineering practices