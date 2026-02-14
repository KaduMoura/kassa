# 07 — AI Provider Integration (Gemini-based; Optional LangChain-Ready)

This document specifies how the system integrates with the AI provider(s), with a strong focus on:
- **Two-stage Gemini strategy** (Vision extraction + Catalog-aware rerank)
- **Runtime API key handling (in-memory only)**
- **Provider abstraction** to avoid lock-in and enable testing/mocking
- **Strict prompting + schema validation** for reliability
- **Cost/latency controls** (timeouts, truncation, bounded retries)
- **AI observability** (timings, token-like usage where available, error taxonomy)

> Note: The topic title mentions “OpenAI/LangChain” because it comes from the job description.  
> In this implementation, the chosen provider is **Google Gemini**.  
> The architecture remains **LangChain-ready** (optional) by introducing clean interfaces and prompt templates that can be wrapped in LangChain later without refactoring the domain logic.

---

## 07.1 Provider Choice and Justification

### Selected Provider
- **Google Gemini API**
  - **Gemini 2.5 Flash** — Stage 1: image understanding / structured signal extraction
  - **Gemini 3 Flash Preview** — Stage 2: reranking candidates with catalog context

### Why Gemini for this assessment
#### A) Direct support for multimodal understanding
- Stage 1 requires robust image understanding.
- Gemini Flash models are optimized for latency and cost while still providing high-quality perception.

#### B) Two-stage specialization aligns with matching needs
- Stage 1: convert image into structured signals (category/type/material/style/keywords + confidence)
- Stage 2: compare catalog candidates and select the best ones (requires reasoning over structured + semi-structured product data)

#### C) High leverage on ranking quality
The evaluation emphasizes **relevance quality**, so:
- Stage 2 rerank provides meaningful improvements in precision (top-K relevance) relative to pure heuristic ranking.

### Design goals preserved regardless of provider
Even though Gemini is chosen, the design ensures:
- Provider calls are isolated behind interfaces
- Output formats are schema-validated and stable
- Fallbacks exist to keep the system functional if the provider fails
- Prompting strategies are versioned and testable

---

## 07.2 Runtime API Key Input (In-Memory Only)

### Requirement Interpretation
The app must accept a user-provided API key at runtime and store it **only in memory**, never persistently.

This means:
- **No database**
- **No file**
- **No localStorage**
- **No cookies**
- **No server-side persistent caching**

It may be held in:
- a React state variable (client memory)
- a transient server request context (per request)
- a short-lived in-process cache (still memory-only), if explicitly documented

---

### Recommended Key Flow (Secure-by-default for demo)
**Client**
1. User enters key in a UI modal (Settings)
2. Key is stored in React state (memory only)
3. On each `/api/search` request, client sends key in header:
   - `X-AI-API-KEY: <key>`

**Server**
1. Reads key from header
2. Uses it to instantiate Gemini client *for that request*
3. Does not store it anywhere (no global variables, no logs)

**Key clearing behavior**
- Refreshing the page clears the key (expected, since memory-only).
- Provide a “Clear key” action.

---

### API Key Validation Rules
- Reject empty key when the user tries to search:
  - return `401` with `MISSING_AI_API_KEY`
- Do not validate by calling provider pre-emptively unless needed
  - validation happens naturally on first provider call
- On provider auth error:
  - return `401` or `403` with `INVALID_AI_API_KEY` (without exposing provider details)

---

### Key Redaction & Logging Requirements
- Never log headers that may contain secrets.
- If logging request headers for debugging is needed:
  - explicitly redact `X-AI-API-KEY`
- If errors include request context:
  - ensure the key is not included in stack traces or structured logs.

---

## 07.3 Provider Abstraction (Future Swaps / Testing / LangChain-Ready)

### Why abstraction matters
This project uses Gemini, but:
- job role references OpenAI + LangChain
- reviewers may ask “how would you swap providers?”
- tests need provider mocks

So we define minimal, powerful interfaces:

---

### Core Provider Interfaces

#### `VisionSignalExtractor`
**Responsibility**
- Input: image (+ optional prompt context)
- Output: structured `ImageSignals` (schema-valid)

```ts
interface VisionSignalExtractor {
  extractSignals(input: {
    imageBytes: Buffer;
    prompt?: string;
    requestId: string;
    config: AiConfig;
    apiKey: string;
  }): Promise<ImageSignalsResult>;
}
````

---

#### `CatalogReranker`

**Responsibility**

* Input: signals + prompt + compact candidates
* Output: ordered list (top-K) + optional reasons

```ts
interface CatalogReranker {
  rerank(input: {
    signals: ImageSignals;
    prompt?: string;
    candidates: CandidateSummary[];
    requestId: string;
    config: AiConfig;
    apiKey: string;
  }): Promise<RerankResult>;
}
```

---

### Provider Implementations

* `GeminiVisionSignalExtractor implements VisionSignalExtractor`
* `GeminiCatalogReranker implements CatalogReranker`

Future:

* `OpenAIVisionSignalExtractor`
* `OpenAIReranker`
* `ClaudeVisionSignalExtractor`
* etc.

---

### Where LangChain Fits (Optional)

LangChain can be introduced later by wrapping prompt templates and provider calls into chains:

* `VisionExtractionChain` (multimodal prompt + schema parsing)
* `RerankChain` (candidate context + structured output)
* Add callbacks / tracing for token usage

But for the test, **direct SDK calls + strict schema validation** is simpler and more reliable.

---

### Testing & Mocks

* Provide `FakeVisionSignalExtractor` that returns deterministic signals for test images
* Provide `FakeCatalogReranker` that returns stable ordering
* This ensures unit tests don’t rely on external provider availability.

---

## 07.4 Prompting and Schemas (Vision, Text, JSON Parsing)

### Prompting goals

* Make outputs **stable**
* Make outputs **machine-parseable**
* Make outputs **bounded**
* Ensure output supports retrieval + ranking tasks

---

### General Prompting Rules (Both stages)

* Always request **JSON-only** output
* Always use an explicit schema / field list
* Use low temperature (or equivalent)
* Keep instructions concise and unambiguous
* Avoid free-form prose
* Validate output with Zod
* If invalid: attempt one bounded repair, then fallback

---

### Stage 1 (Gemini 2.5 Flash): Vision Signal Extraction

#### Inputs

* Image bytes
* Optional user prompt
* Optional additional instruction (admin toggles: strictness)

#### Output

A strict JSON object including:

* guesses + confidences
* attributes arrays
* keywords
* quality flags
* optional “dominant item” descriptor

**Recommended schema (conceptual)**

```json
{
  "categoryGuess": { "value": "chair", "confidence": 0.0 },
  "typeGuess": { "value": "dining chair", "confidence": 0.0 },
  "attributes": {
    "style": ["scandinavian"],
    "material": ["wood"],
    "color": ["light wood"],
    "shape": ["straight legs"]
  },
  "keywords": ["wood dining chair", "scandinavian chair"],
  "qualityFlags": {
    "isFurnitureLikely": true,
    "multipleObjects": false,
    "lowImageQuality": false,
    "occludedOrPartial": false
  }
}
```

#### Prompt template (high-level guidance)

* Ask the model to:

  * identify the single most dominant furniture item
  * describe it in structured fields
  * provide multiple keyword phrases for retrieval
  * estimate confidence
  * set quality flags

#### Schema validation requirements

* Strict:

  * unknown keys rejected
  * missing required keys rejected
* Values normalized:

  * arrays for style/material/color
  * confidences within `[0..1]`

#### Repair strategy (bounded)

If JSON invalid:

1. re-prompt: “Return only valid JSON matching this schema”
2. if still invalid: fallback to broad retrieval

---

### Stage 2 (Gemini 3 Flash Preview): Catalog-aware Rerank

#### Inputs

* Canonical signals (Stage 1)
* Prompt (optional)
* Candidate list (TopM), compacted:

  * stable id + relevant fields
  * truncated description
  * normalized type/category

**Candidate summary shape**

```json
{
  "id": "abc123",
  "title": "...",
  "category": "...",
  "type": "...",
  "price": 129.99,
  "dims": { "w": 60, "h": 85, "d": 55 },
  "desc": "truncated..."
}
```

#### Output

Strict JSON:

* ordered array of ids
* optional small set of reasons per id (controlled vocabulary)
* optional confidence band

Example:

```json
{
  "rankedIds": ["abc123", "def456", "ghi789"],
  "reasons": {
    "abc123": ["Type match", "Material match"],
    "def456": ["Category match", "Keyword match"]
  }
}
```

#### Constraints to enforce in prompt

* Must only rank ids provided
* Must not invent products
* Must return at least K if possible
* Must output valid JSON only

#### Output validation rules

* `rankedIds` is required and must be subset of candidate ids
* De-duplicate ids
* If model returns fewer than required:

  * append remaining candidates by heuristic score

---

### JSON Parsing & Validation

* Use **Zod** schemas for Stage 1 and Stage 2 outputs.
* Reject “nearly JSON” (single quotes, trailing commas) unless you implement safe repair.
* Prefer:

  * strict parse
  * one repair attempt
  * fallback path

---

### Prompt Versioning

Maintain explicit prompt versions:

* `VISION_PROMPT_V1`
* `RERANK_PROMPT_V1`

Store them in code under:

* `apps/api/src/infra/gemini/prompts/`

This makes it easy to:

* update prompts
* document changes in CHANGELOG
* reproduce behaviors in a demo

---

## 07.5 Cost/Latency Controls (Timeouts, Limits, Retries)

### Why controls are critical

Two AI calls per search can be expensive and slow.
We must bound:

* request time
* candidate payload size
* retries
* model output length

---

### Timeouts

Define timeouts at three layers:

1. **Stage-level**

   * Stage 1 timeout (e.g., 6s)
   * Stage 2 timeout (e.g., 7s)
2. **Mongo timeout**

   * e.g., 2s
3. **Total request timeout**

   * e.g., 15s

**Behavior**

* If Stage 1 times out:

  * fallback to broad retrieval using prompt keywords only (if prompt exists)
  * otherwise minimal keywords from generic furniture terms (very broad)
* If Stage 2 times out:

  * return heuristic ranking only

---

### Candidate Limiting and Compaction (Stage 2)

To avoid context overflow:

* `llmRerankTopM`: number of candidates sent to Stage 2 (default 20–40)
* `maxDescriptionChars`: description truncation cap (default 200–300)
* Remove any non-essential fields
* Use stable short ids, not full Mongo object details if not needed

---

### Retries

Retries should be conservative:

* Stage 1: 0–1 retry
* Stage 2: 0–1 retry

Retry only on:

* 429 (rate limiting)
* transient network errors
* 5xx provider errors

No retries on:

* invalid user input
* repeated JSON schema failures (after repair attempt)

Use minimal backoff for a single retry (e.g., 200–500ms jitter).

---

### Output Length Limits

Both stages should:

* produce structured JSON
* keep arrays bounded:

  * max 10 keywords
  * max 5 style values
  * max 5 materials
  * etc.

Stage 2 should:

* keep reasons short, controlled vocabulary only

These constraints reduce token usage and improve reliability.

---

### Admin Controls

Expose relevant cost/latency knobs in Admin:

* enable/disable LLM rerank
* llmRerankTopM
* maxDescriptionChars
* timeouts and retries (optional, with safe bounds)

Even if Admin allows changes, enforce hard upper bounds server-side.

---

## 07.6 AI-Specific Observability (Tokens, Timings, Errors)

### Goals

* Understand where time is spent
* Diagnose provider failures
* Compare quality vs speed tradeoffs
* Provide evidence for README (evaluation + iteration)

---

### Metrics to Capture per Search Request

At minimum log:

* `requestId`
* `stage1Ms`
* `mongoMs`
* `stage2Ms`
* `totalMs`
* `fallbackVision` (bool)
* `fallbackRerank` (bool)
* `candidatesRetrieved`
* `candidatesSentToRerank`
* `resultsReturned`

---

### Token / Usage Tracking

Gemini token reporting may vary depending on SDK and endpoint.

**Implementation approach**

* Capture any provider usage metadata if available:

  * prompt tokens
  * output tokens
  * total tokens
* If not available:

  * estimate approximate size:

    * count characters sent to Stage 2
    * count candidates and description length
  * log as `inputChars`, `outputChars` as proxy

---

### Error Taxonomy (Standardized)

Normalize provider errors into stable categories:

* `AI_TIMEOUT`
* `AI_RATE_LIMIT`
* `AI_AUTH_ERROR`
* `AI_INVALID_OUTPUT`
* `AI_NETWORK_ERROR`
* `AI_INTERNAL_ERROR`
* `AI_CONTEXT_TOO_LARGE`

Each error log should include:

* `requestId`
* stage (`stage1` or `stage2`)
* mapped error code
* HTTP status code (if relevant)
* retry attempted (bool)
* fallback applied (bool)

Never include:

* API key
* raw image
* raw provider response (unless admin debug mode, sanitized)

---

### Admin Debug View (Optional but Valuable)

In Admin, provide a lightweight “Last searches” panel:

* requestId
* timings breakdown
* candidate counts
* fallback flags
* error codes (if any)
* (optional) extracted signals preview

This helps demonstrate iteration and tuning during the live demo.

---

## Expected Outcome

After implementing this AI integration design, the system will have:

* A clean Gemini-based two-stage matching pipeline
* Strict, schema-validated outputs for reliability
* Robust runtime API key handling (memory-only)
* Bounded latency and cost through caps and timeouts
* Provider abstraction enabling easy future swaps (OpenAI/LangChain)
* Useful observability for debugging, evaluation, and demo storytelling