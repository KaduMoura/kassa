# 10 — Admin (Back-Office Configuration)

This document defines the **Admin / Back-office** surface of the application. The Admin UI is **not consumer-facing**; it exists to:
- tune retrieval and ranking behavior quickly,
- experiment with matching strategies,
- support evaluation and debugging,
- and demonstrate engineering maturity (separation of concerns + safe configuration).

The Admin is deliberately **lightweight**:
- minimal UI
- minimal access control
- minimal persistence
…but still robust enough to prove that **the system’s behavior changes without code edits**.

---

## 10.1 Purpose of Admin and Constraints (Internal)

### Primary Purpose
Admin is an **experimentation console** for the matching pipeline. It allows a reviewer to:
- adjust the candidate generation settings (recall vs precision)
- adjust weights and thresholds in heuristic scoring
- enable/disable reranking
- control timeouts / truncation to trade latency vs quality
- observe whether fallbacks are occurring

Admin makes the system “tunable”, which is a core expectation in real-world retrieval and ranking systems.

---

### Explicit Non-Goals (What Admin is NOT)
Admin is **not**:
- a full multi-user dashboard
- an authentication/roles system
- a production-grade configuration platform
- a long-term audit/analytics system
- a database management UI

Admin should not enable:
- arbitrary Mongo query execution
- arbitrary prompt injection to system prompts (unsafe)
- direct manipulation of internal secrets (e.g., server env vars)

---

### Scope Constraints (What we intentionally keep small)
- No user accounts and no login flows (unless you already have a simple token gate).
- No complex state management.
- No heavy telemetry ingestion pipeline.
- No long-term storage required (persistence can be optional and explicitly documented).

The Admin exists primarily for evaluation and tuning during the test and demo.

---

### UX Principles for Admin
- Make it obvious which knobs affect which stage:
  - Stage 1 (vision signals)
  - Retrieval (Mongo candidate generation)
  - Heuristic ranking
  - Stage 2 rerank (Gemini 3)
- Show safe defaults and explain effects briefly.
- Provide guardrails (hard bounds) to avoid breaking behavior.

---

## 10.2 Exposed Parameters (Retrieval / Ranking)

### Parameter Design Goals
Admin parameters should:
- map to real system levers (not fake toggles)
- be safe to modify (bounded ranges)
- produce visible behavior changes in the next search request
- support reproducible evaluation

A good Admin feels like a “tuning panel” for:
- **recall vs precision**
- **latency vs quality**
- **robustness vs strictness**

---

### 10.2.1 Retrieval Parameters (Candidate Generation)

#### `candidateTopN`
- **Meaning:** How many products are fetched from Mongo as initial candidates.
- **Impact:** Higher N improves recall (less chance to miss correct item) but increases latency and rerank context size.
- **Recommended default:** 60–100
- **Hard cap:** 200

---

#### `minCandidates`
- **Meaning:** If fewer than this number are returned, the system relaxes filters automatically.
- **Impact:** Prevents empty results when filters are too strict.
- **Default:** 10–15

---

#### `useCategoryFilter`
- **Meaning:** Whether to apply category filter when vision confidence is high.
- **Impact:** Improves precision but can reduce recall if catalog category values differ.
- **Default:** true

---

#### `useTypeFilter`
- **Meaning:** Whether to apply type filter when vision confidence is high.
- **Default:** false or true depending on data consistency
- **Note:** Type values can be noisy; consider type as soft bias.

---

#### Confidence Thresholds
- `minCategoryConfidence`
- `minTypeConfidence`
- **Meaning:** Minimum confidence to apply those filters.
- **Default:** 0.35–0.50 depending on vision consistency.

---

#### Keyword Selection (optional)
- `maxKeywordsForRetrieval`
- **Meaning:** Controls how many keywords from Stage 1 (and prompt) are used in DB query.
- **Impact:** Too many keywords can narrow too much or degrade regex query performance.
- **Default:** 5–8

---

### 10.2.2 Heuristic Ranking Parameters

#### `weights`
A grouped structure:
- `weights.text`
- `weights.category`
- `weights.type`
- `weights.dimensions`
- `weights.price`
- `weights.attributes` (style/material/color)

**Meaning**
Controls the composite score used for pre-ranking and fallback ranking.

**Default example**
- text: 0.55
- type: 0.20
- category: 0.15
- attributes: 0.05
- dimensions: 0.03
- price: 0.02

**Guardrails**
- weights should be normalized (sum ~ 1.0)
- enforce ranges [0..1]
- if user breaks normalization, auto-normalize on save

---

#### `matchBands`
- thresholds for HIGH / MEDIUM / LOW
- helps UX explainability without exposing raw numeric scores

Example:
- HIGH >= 0.80
- MEDIUM >= 0.55
- LOW otherwise

---

### 10.2.3 Reranking (Gemini 3) Parameters

#### `enableLLMRerank`
- **Meaning:** Toggle Stage 2 rerank on/off.
- **Impact:** Off = faster, deterministic; On = better nuance and precision.
- **Default:** true

---

#### `llmRerankTopM`
- **Meaning:** How many top candidates from heuristic ranking are sent to Gemini 3.
- **Impact:** Higher M can improve results but increases latency and context size.
- **Default:** 20–40
- **Hard cap:** 60

---

#### `maxDescriptionChars`
- **Meaning:** Candidate description truncation before sending to LLM.
- **Default:** 200–300
- **Hard cap:** 500

---

#### `rerankOutputK`
- **Meaning:** Desired number of final matches returned to UI.
- **Default:** 10
- **Hard cap:** 25

---

### 10.2.4 Timeouts and Retries (Latency Controls)

#### `timeoutsMs`
- `stage1`
- `mongo`
- `stage2`
- `total`

Defaults:
- stage1: 6000
- mongo: 2000
- stage2: 7000
- total: 15000

---

#### `retries`
- `stage1Retries` (0–1)
- `stage2Retries` (0–1)

**Guardrail**
- Do not allow more than 1 retry per stage.

---

### 10.2.5 Fallback Controls

#### `fallbackStrategy`
- enum:
  - `broad`
  - `prompt-first`
  - `vision-first`
  - `heuristic-only`

**Meaning**
Controls how the system behaves when:
- Stage 1 fails
- Stage 2 fails
- candidates are too few

This is useful for demos:
- show how the system stays functional under failures.

---

### 10.2.6 Debug Toggles (Admin-only)
These should never leak to user UI.

- `showSignals`
- `showQueryPlan`
- `showTimings`
- `showCandidateCounts`
- `includeReasons` (light explainability)

---

## 10.3 Persistence of Parameters (In-Memory vs Local Config)

Admin parameters must be changeable and take effect immediately.  
Persistence is optional, but you must document which approach you chose.

### Option A — In-Memory Only (Simplest; recommended)
- Store config in backend memory:
  - e.g., `ConfigStore` singleton
- On server restart, config resets to defaults.

**Pros**
- fast to implement
- matches assessment focus
- respects “no over-engineering”

**Cons**
- changes are lost on restart

**Best when**
- the evaluator runs the app locally
- you want maximum simplicity

---

### Option B — Local Config File (Explicitly documented)
- Persist config to a local JSON file (e.g., `./data/admin-config.json`)
- Must be optional and safe:
  - enabled only in dev
  - file excluded from git
- Still not storing user API keys (never store secrets)

**Pros**
- settings survive restart
- still lightweight

**Cons**
- introduces filesystem behavior (Docker volume considerations)

---

### Option C — Browser Local Storage (Admin-only; avoid for strictness)
- The requirement forbids persisting **API keys**, but does not forbid persisting config.
- Still, keeping config server-side is cleaner for system-level tuning.

---

### Recommended Approach
Use **Option A (in-memory)** by default, and clearly document:
- “Admin settings reset on restart”
- Provide a “Reset to defaults” button

---

### Reset and Defaults
Admin must allow:
- **Reset to defaults**
- (Optional) Export config JSON
- (Optional) Import config JSON (guarded by schema validation)

All imports must:
- validate via Zod
- reject unknown keys
- enforce bounds

---

## 10.4 Admin Protection (Minimal Gate/Flag/Token)

The Admin is internal, but it should not be openly accessible in a real deployment.

### Goal
Implement a minimal mechanism that:
- does not add full auth complexity
- demonstrates security awareness

---

### Option A — Environment Flag (Simplest)
- `ENABLE_ADMIN=true`
- if false:
  - hide `/admin` route on frontend
  - reject backend config endpoints with `404`

**Pros**
- minimal
- clear separation

**Cons**
- no real access control if enabled

---

### Option B — Token Gate (Recommended)
- Backend requires `X-ADMIN-TOKEN` header for:
  - `PUT /api/config`
  - (optional) `GET /api/config` if you want extra safety
- Frontend admin page prompts for token (in-memory)
- Token stored only in memory
- Token provided via `.env`

**Pros**
- still minimal
- demonstrates security awareness
- protects config mutation endpoints

**Cons**
- small UX friction (acceptable for admin)

---

### Option C — Basic Auth (Acceptable but heavier)
- HTTP Basic Auth for `/admin`
- still simple, but more “auth-y” than needed for the test

---

### Recommended Minimal Model
**Token Gate**:
- `ADMIN_TOKEN=...` in backend env
- `PUT /api/config` requires matching token
- Frontend stores token in memory (admin-only)

---

### Avoiding Security Footguns
Admin should **not** allow:
- editing system prompts directly (prompt injection risk)
- arbitrary Mongo query text execution
- viewing server env vars
- exporting request logs containing sensitive headers

---

## 10.5 Telemetry: Simple Executions Panel (Optional)

Telemetry is optional but valuable for:
- demonstrating evaluation thinking
- showing fallback behavior and performance
- supporting live demo storytelling

If time allows, implement a very lightweight telemetry panel.

---

### 10.5.1 Telemetry Goals
Track a small set of per-search metrics:
- requestId
- timestamp
- stage timings
- candidate counts
- fallback flags
- error codes (if any)
- (optional) user feedback score (thumbs up/down)

No PII is involved; still keep it minimal and safe.

---

### 10.5.2 Storage Strategy
Use a bounded in-memory ring buffer:
- keep last 50–200 executions
- older entries drop off

This avoids:
- databases
- log pipelines
- complexity

---

### 10.5.3 Telemetry Data Shape
Example record:

```json
{
  "requestId": "abc123",
  "at": "2026-02-11T12:34:56Z",
  "timings": {
    "totalMs": 8123,
    "stage1Ms": 2100,
    "mongoMs": 340,
    "stage2Ms": 4500
  },
  "counts": {
    "candidatesRetrieved": 80,
    "candidatesSentToRerank": 30,
    "resultsReturned": 10
  },
  "fallbacks": {
    "visionFallback": false,
    "rerankFallback": false,
    "broadRetrieval": false
  },
  "error": null
}
````

---

### 10.5.4 Admin Telemetry UI (Minimal)

Admin page may include a “Telemetry” tab or section:

* table listing last N requests
* click row to view details

Details view can include:

* extracted signals (if debug enabled)
* query plan chosen (Plan A/B/C)
* notices (fallback used)
* safe error message / code

---

### 10.5.5 Export for README / Debugging (Optional)

Add “Export JSON” button:

* downloads last N telemetry entries
* helps create reproducible notes for evaluation section

---

### 10.5.6 Guardrails

* Never include API keys in telemetry
* Never include raw images
* Avoid storing full prompt text (optional):

  * store prompt length or hashed prompt if you prefer

---

## Expected Outcome

After implementing this Admin design, the system will provide:

* A clear internal interface to tune retrieval and ranking without code changes
* Safe, bounded parameter controls (weights, thresholds, candidate sizes)
* Minimal but credible admin protection (token gate)
* Optional lightweight telemetry to support evaluation and live demo
* A configuration approach that remains KISS and aligned with assessment scope