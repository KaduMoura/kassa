# 05 — Backend Node.js (API & Services)

This document specifies the backend responsibilities, API contracts, service orchestration, MongoDB read-only access, observability, failure handling, and environment configuration. The goal is to implement a backend that is:

- **Simple and readable** (KISS)
- **Deterministic and testable**
- **Robust under failures**
- **Optimized for relevance and ranking quality**
- **Safe with user-provided API keys (in-memory only)**

Assumed backend stack:
- Node.js + TypeScript
- Fastify (recommended) or Express
- MongoDB official driver
- Zod for validation
- Structured logging (pino or similar)

---

## 05.1 API Contract (Routes, Payloads, Errors)

### API Design Principles
- Use **REST** with a small, focused surface.
- Prefer **one primary search endpoint** that receives:
  - image file
  - optional prompt
  - optional request-level overrides (if allowed)
- Return a **consistent response envelope**: `{ data, error, meta }`
- Every request generates a `requestId` / `searchId` for traceability.

---

### Base Response Envelope
All endpoints must follow the same structure:

```json
{
  "data": null,
  "error": null,
  "meta": {
    "requestId": "uuid-or-shortid",
    "timings": {
      "totalMs": 0,
      "stage1Ms": 0,
      "mongoMs": 0,
      "stage2Ms": 0
    },
    "notices": [
      { "code": "FALLBACK_USED", "message": "Showing best-effort matches." }
    ]
  }
}
````

* `data`: payload for success responses
* `error`: payload for failure responses
* `meta`: always present; includes correlation and diagnostic-friendly info

---

### Endpoints Overview

#### `GET /health`

**Purpose**

* Liveness/health check for local dev, Docker, CI.

**Response**

* `200 OK` with minimal status, no sensitive info.

---

#### `GET /api/config`

**Purpose**

* Read current runtime Admin configuration (retrieval/ranking parameters).

**Auth / Protection**

* Minimal admin gate recommended (see §04.7): token header or env-based secret.

**Response**

```json
{
  "data": {
    "candidateTopN": 60,
    "enableLLMRerank": true,
    "llmRerankTopM": 30,
    "maxDescriptionChars": 240,
    "weights": {
      "text": 0.55,
      "type": 0.25,
      "category": 0.15,
      "dimensions": 0.05
    },
    "thresholds": {
      "minVisionConfidence": 0.35
    },
    "timeoutsMs": {
      "stage1": 6000,
      "stage2": 7000,
      "mongo": 2000,
      "total": 15000
    },
    "retries": {
      "stage1": 1,
      "stage2": 1
    }
  },
  "error": null,
  "meta": { "requestId": "..." }
}
```

---

#### `PUT /api/config`

**Purpose**

* Update runtime Admin configuration.

**Rules**

* Input must be schema-validated (Zod).
* Reject unknown fields (strict parsing).
* Apply changes immediately for subsequent requests.

**Request body**
Same shape as GET response `data` (or partial patch if you choose PATCH).

**Response**

* Returns updated config object.

---

#### `POST /api/search`

**Purpose**

* Main search endpoint.

**Content-Type**

* `multipart/form-data`

**Headers**

* `X-AI-API-KEY`: user-provided Gemini API key (runtime, not stored)
* `X-Request-Id`: optional client-provided id (else server generates)
* `X-Admin-Token`: optional if you want to allow “admin-only overrides”

**Form fields**

* `image`: required file
* `prompt`: optional string
* `clientContext`: optional JSON string (for analytics/debug; sanitized)
* Optionally: request-level overrides (discouraged for simplicity; prefer Admin config)

**Response**

```json
{
  "data": {
    "query": {
      "prompt": "scandinavian, light wood",
      "signals": {
        "categoryGuess": { "value": "chair", "confidence": 0.74 },
        "typeGuess": { "value": "dining chair", "confidence": 0.62 },
        "attributes": { "color": "light wood", "style": "scandinavian" }
      }
    },
    "results": [
      {
        "productId": "mongoObjectId-or-hash",
        "title": "...",
        "category": "...",
        "type": "...",
        "price": 123.45,
        "width": 50,
        "height": 80,
        "depth": 55,
        "match": {
          "rank": 1,
          "band": "HIGH",
          "score": 0.93,
          "reasons": ["Type match", "Style match", "Material match"]
        }
      }
    ]
  },
  "error": null,
  "meta": {
    "requestId": "...",
    "timings": { "totalMs": 8123, "stage1Ms": 2100, "mongoMs": 340, "stage2Ms": 4500 },
    "notices": []
  }
}
```

> Note: `reasons` should be short and safe, not raw model output. If you keep it, constrain it tightly.

---

### Error Response Format

```json
{
  "data": null,
  "error": {
    "code": "INVALID_IMAGE_FORMAT",
    "message": "Unsupported image format. Upload JPG, PNG, or WebP.",
    "details": {
      "supported": ["image/jpeg", "image/png", "image/webp"]
    }
  },
  "meta": { "requestId": "...", "timings": { "totalMs": 12 }, "notices": [] }
}
```

**Error Code Conventions**

* `VALIDATION_*`: input issues (image, prompt, config)
* `PROVIDER_*`: Gemini failures (timeout, rate limit, invalid response)
* `DB_*`: Mongo failures
* `INTERNAL_*`: unexpected exceptions

**HTTP Status Mapping (recommended)**

* `400` invalid request payload/validation
* `401` missing/invalid API key (if required)
* `403` admin token missing/invalid
* `413` file too large
* `429` provider rate limit
* `500` unexpected backend error
* `502/503` provider dependency failure (optional)

---

## 05.2 Image Upload (Validation, Limits, Formats)

### Validation Goals

* Prevent invalid/unsafe input
* Bound costs and latency (file size matters)
* Improve model success rate (reject obviously unusable inputs)

---

### Supported Formats

* Default allowlist:

  * `image/jpeg`
  * `image/png`
  * `image/webp`

Reject:

* `image/gif` (often not useful for furniture, larger, multi-frame)
* `image/heic` unless explicitly supported (adds complexity)

---

### File Size Limits

* Default maximum: **5–10MB** (configurable)
* Hard cap should exist regardless of Admin config (security posture)

**Behavior**

* If file exceeds max:

  * Return `413 Payload Too Large`
  * Error code: `VALIDATION_IMAGE_TOO_LARGE`

---

### Optional Image Quality Heuristics

Not required, but helpful:

* If shortest side < 256px:

  * warn or reject (configurable)
* If image is extremely dark:

  * warn (but still allow)
* If EXIF orientation exists:

  * normalize orientation before sending to model (optional)

---

### Handling Upload in Node

Recommended implementation:

* Use streaming multipart parsing:

  * Fastify: `@fastify/multipart`
  * Express: `multer` (memory storage) or busboy

**Policy**

* Prefer **in-memory** handling for the test.
* Avoid writing uploads to disk unless explicitly documented (and cleaned up).

---

### Sanitization & Safety

* Enforce allowlist by MIME type and/or file signature (magic bytes), not filename.
* Never trust client-provided MIME alone.
* If storing temporarily, ensure automatic cleanup.

---

## 05.3 Matching Pipeline (Orchestration)

### Use Case: `RunImageSearchUseCase`

The search flow is orchestrated by a single use case function:

**Inputs**

* `imageBuffer` (or stream converted to buffer)
* `prompt?: string`
* `runtimeApiKey: string`
* `config: AdminConfig`
* `requestId/searchId`

**Outputs**

* `SearchResponse` including results + notices + timings

---

### Pipeline Steps (Logical)

1. **Validate & Normalize Inputs**

   * image validated and optionally normalized
   * prompt trimmed and bounded

2. **Stage 1: Vision Signal Extraction (Gemini 2.5 Flash)**

   * call Gemini Vision extractor
   * parse and validate JSON using Zod
   * if invalid or low confidence → mark `fallbackVision = true`

3. **Build Retrieval Plan**

   * decide retrieval approach:

     * strict filters (only if confidence high)
     * hybrid keyword + soft filters
     * broad keyword fallback

4. **Candidate Retrieval (MongoDB)**

   * query `products` read-only
   * return top `candidateTopN` candidates (bounded)

5. **Heuristic Pre-Ranking (Optional but useful)**

   * compute quick composite score to:

     * trim candidates for Stage 2 (`llmRerankTopM`)
     * enforce stable ordering even before LLM rerank
   * This also helps keep Stage 2 context small.

6. **Stage 2: Catalog-Aware Rerank (Gemini 3 Flash Preview)**

   * if enabled:

     * send compact candidates + signals + prompt
     * parse ranked output (ids in order)
     * if fails → `fallbackRerank = true`

7. **Final Output Assembly**

   * Map ranked ids back to products
   * Add match band / optional reasons
   * Build notices (fallback used, low confidence)
   * Attach timings

---

### Determinism & Repeatability

* All nondeterministic provider parameters should be fixed:

  * low temperature for structured outputs
* Sorting should be stable (tie-breakers by productId).

---

## 05.4 MongoDB Access Layer (Read-Only)

### Constraints

* Must not modify database.
* Must not create indexes.
* Must not write new collections/documents.

---

### Mongo Client Setup

* Single shared client instance per process
* Connection pooling enabled by default
* Ensure proper close on shutdown

---

### Data Model

`products` documents contain:

* `title: string`
* `description: string`
* `category: string`
* `type: string`
* `price: number`
* `width: number`
* `height: number`
* `depth: number`

Backend should map them into a `Product` type with strict typing.

---

### Query Building Principles

* Prefer queries that leverage existing indexes:

  * likely indexes might exist on `category` and `type` and/or text indexes
  * but you cannot assume: implement safe fallback behavior
* Use bounded `limit` and projection to reduce payload size:

  * return only fields needed for ranking and UI

**Projection example**

* `_id, title, description, category, type, price, width, height, depth`

---

### Candidate Retrieval Strategies (Examples)

Depending on available index support:

1. **Text-first** retrieval:

* if a text index exists: `$text: { $search: keywords }`

2. **Regex fallback** (careful; can be slow):

* `title: /keyword/i` OR `description: /keyword/i`
* should be used with small limits and only when necessary

3. **Category/type filtering**:

* `category: "chair"`
* `type: { $in: [...] }`

> Implementation note: the architecture should support multiple strategies and pick one based on confidence + config.

---

### Guardrails

* Enforce max `candidateTopN` and `llmRerankTopM` hard caps.
* Always use timeouts for DB operations (driver-level or application-level).

---

## 05.5 Logging, Tracing & Request Correlation

### Goals

* Make debugging easy without exposing sensitive data
* Enable performance tuning of the pipeline
* Allow demonstration-quality explanation of behavior and fallbacks

---

### Correlation IDs

* Generate `requestId` at request start if not provided
* Attach to:

  * logs
  * response meta
  * internal error objects

---

### What to Log (Structured)

Minimum:

* `requestId`
* endpoint name
* stage timings:

  * stage1Ms
  * mongoMs
  * stage2Ms
  * totalMs
* fallback flags:

  * `fallbackVision`
  * `fallbackRerank`
  * `fallbackBroadRetrieval`
* candidate counts:

  * `candidatesRetrieved`
  * `candidatesSentToRerank`
  * `resultsReturned`

---

### What NOT to Log

* API keys
* Full image content
* Full prompt text if sensitive (can log truncated length, or hash)
* Raw model output (unless debug mode and sanitized)

---

### Tracing (Lightweight)

No need for OpenTelemetry in the test, but:

* log a single structured “search summary” event per request
* optionally expose debug meta in Admin (not to end users)

---

## 05.6 AI Provider Failure Handling

### Failure Types to Expect

* **Timeouts**
* **Rate limits (429)**
* **Service errors (5xx)**
* **Invalid or incomplete JSON output**
* **Over-context / token limit**
* **Network errors**

---

### Policies (Bounded and Predictable)

#### Timeouts

* Per-stage timeout:

  * Stage 1: e.g., 6s
  * Stage 2: e.g., 7s
* Overall request timeout:

  * e.g., 15s

If timeout:

* Stage 1 timeout → fallback broad retrieval
* Stage 2 timeout → heuristic-only ranking

---

#### Retries

* Retries should be low and bounded (0–1 retry).
* Retry only on transient errors:

  * 429, 5xx, network failures
* Never retry on:

  * validation errors
  * obvious bad input

---

#### JSON Parsing Failures (Stage 1/2)

* Use Zod to validate output
* If invalid:

  * attempt one “repair” prompt (optional)
  * if still invalid → fallback path

---

#### Rate Limiting

* Return friendly user error:

  * `429` with “Try again in a moment”
* Consider adding exponential backoff internally for the single retry (optional).

---

#### Token/Context Overflow (Stage 2)

* Hard cap candidates and truncation
* If still too large:

  * skip rerank
  * return heuristic results
* Log internal notice for Admin debug

---

### User-Facing Impact

End users should not see technical provider details.
They should see:

* “Showing best-effort matches.”
* “Try again” guidance.

---

## 05.7 Environment Configuration (Dev/Prod)

### Configuration Sources

* Environment variables (`process.env`)
* `.env` for local dev
* `.env.example` in repo
* Optional: runtime Admin config store

---

### Core Env Vars (Suggested)

#### Mongo

* `MONGO_URI` (provided connection string)
* `MONGO_DB_NAME=catalog`
* `MONGO_COLLECTION=products`

#### Server

* `PORT=3001`
* `NODE_ENV=development|production`
* `CORS_ORIGIN=http://localhost:5173` (or web host)

#### Admin Gate (minimal)

* `ADMIN_TOKEN=...` (optional)

#### Limits

* `MAX_IMAGE_MB=10`
* `MAX_PROMPT_CHARS=500`

#### Timeouts

* `STAGE1_TIMEOUT_MS=6000`
* `STAGE2_TIMEOUT_MS=7000`
* `TOTAL_TIMEOUT_MS=15000`
* `MONGO_TIMEOUT_MS=2000`

#### Logging

* `LOG_LEVEL=info|debug|warn|error`
* `LOG_REDACT=true`

---

### Dev vs Prod Behavior

#### Development

* verbose logs (still sanitized)
* relaxed CORS for local UI
* optional debug meta enabled in Admin

#### Production (Demo/Deployment)

* strict CORS
* reduced log verbosity
* admin gate enabled
* safe error messaging

---

### Configuration Validation

At boot:

* validate required env vars
* fail fast if missing (better DX)

Use Zod to validate config:

* ensures consistent types
* prevents runtime surprises

---

## Expected Implementation Outcome

After implementing this backend spec, the system should:

* Provide a stable, well-documented REST API
* Accept image + prompt and return ranked matches
* Use Gemini in a two-stage pipeline with robust fallbacks
* Query MongoDB read-only efficiently and safely
* Provide strong observability (request correlation + timings)
* Handle provider failures gracefully and predictably
* Run cleanly in local dev and demo environments with minimal setup friction