# 04 — Solution Architecture

This document describes the **system architecture** for the Image-Based Product Search application, focusing on a simple, defensible design that maximizes **retrieval + ranking quality** while keeping the implementation **KISS** and easy to explain in a live demo.

The architecture is intentionally:
- **Monorepo-oriented** (web + api)
- **Layered** (clear separation of concerns)
- **Composable** (retrieval/ranking strategies can evolve)
- **Provider-abstracted** (Gemini calls behind interfaces)
- **Operationally pragmatic** (timeouts, fallbacks, observability)

---

## 04.1 Macro View (Frontend, Backend, Integrations)

### High-Level Components
1. **Web App (React + TypeScript)**  
   - End-user search UI: image upload, optional prompt, results rendering
   - Admin UI: configure retrieval/ranking parameters
   - Runtime API key input (in-memory only)

2. **API Service (Node.js + TypeScript)**  
   - REST endpoints for search + admin config
   - Orchestrates the two-stage AI pipeline
   - Queries MongoDB (read-only)
   - Implements fallback logic
   - Produces ranked results for the UI

3. **External Integrations**
   - **MongoDB Atlas (read-only)**: `catalog.products`
   - **Google Gemini API**:
     - Gemini 2.5 Flash (Stage 1 vision signal extraction)
     - Gemini 3 Flash Preview (Stage 2 catalog-aware rerank)

---

### Primary Runtime Flow (Request-Level)
**User Search Request** (image + optional prompt + current config):

1. Web app submits request to API:
   - multipart/form-data containing image + prompt
   - includes runtime API key (header) *or* an alternative secure mechanism
2. API validates inputs, generates `searchId`
3. **Stage 1 (Gemini 2.5 Flash)**:
   - image → structured JSON signals
4. API builds retrieval query using signals + prompt
5. MongoDB candidate retrieval:
   - returns `TopN` candidates
6. **Stage 2 (Gemini 3 Flash Preview)**:
   - signals + compact candidates → ranked TopK results
7. API returns ranked results + meta
8. Web renders results and any notices (fallback, low confidence, etc.)

---

### Admin Flow (Configuration-Level)
- Web Admin updates config values
- API stores config in memory (default) or simple persisted store (optional)
- Config affects subsequent searches (no redeploy needed)

---

### Data Ownership & Persistence
- MongoDB is **read-only** and owned externally.
- Admin config is owned by the app:
  - **default**: in-memory store
  - optional: file-based config for demo only (explicitly documented)
- API key is not persisted:
  - not written to disk
  - not stored in DB
  - not logged

---

## 04.2 Separation of Responsibilities & Layers

### Design Principle
Each layer must have a single reason to change:
- HTTP concerns are isolated from matching logic
- Matching logic is isolated from infra clients
- Provider specifics are hidden behind interfaces
- Config and runtime parameters are explicit and traceable

---

### Backend Layering Model

#### 1) API Layer (Routes/Controllers)
**Responsibilities**
- Parse request (multipart, prompt, headers)
- Validate file type/size
- Validate prompt length
- Build a `SearchRequest` DTO
- Return consistent response envelope
- Map domain errors → HTTP status codes

**Does NOT**
- Build complex Mongo queries directly
- Implement ranking logic
- Know Gemini prompt content details (delegates to services)

---

#### 2) Application Layer (Use Cases)
**Responsibilities**
- Orchestrate the entire search pipeline
- Manage timing, retries, fallbacks
- Apply admin parameters (config)
- Collect meta for response (timings, fallback flags)

**Example Use Case**
- `RunImageSearchUseCase.execute(request): SearchResponse`

**Does NOT**
- Speak directly to HTTP layer types
- Contain raw Gemini API calls or Mongo driver calls
- Contain UI-specific formatting

---

#### 3) Domain Layer (Matching + Strategy)
**Responsibilities**
- Encapsulate retrieval and ranking strategies
- Provide composable components:
  - `SignalExtractor` (Stage 1)
  - `CandidateRetriever`
  - `CandidateReranker` (Stage 2)
  - `HeuristicRanker` (fallback)
- Define domain types:
  - `ImageSignals`
  - `CandidateProduct`
  - `RankedProduct`
  - `SearchNotice` (fallback/low confidence)

**Does NOT**
- Know how to read environment variables
- Know how HTTP status codes work

---

#### 4) Infrastructure Layer (Clients + Adapters)
**Responsibilities**
- MongoDB client wrapper (read-only)
- Gemini client wrapper
- Config store implementation
- Logger and sanitization helpers

**Does NOT**
- Contain business rules or ranking policy
- Decide pipeline orchestration

---

### Frontend Responsibility Separation

#### Web UI (User)
- Collect inputs (image + prompt)
- Provide immediate validation
- Display progress states
- Render ranked results
- Display notices and suggestions

#### Admin UI
- Edit retrieval/ranking parameters
- Show optional debug/meta
- Enable/disable rerank and adjust limits

---

### Clear Contracts Between Layers
**Key rule:** all major layers communicate via well-defined TypeScript types.

Examples:
- `SearchRequestDTO`
- `AdminConfigDTO`
- `ImageSignals`
- `RankedResultsResponse`

These contracts prevent “stringly-typed” behavior and make the system safer to evolve.

---

## 04.3 Extensibility Strategy (Without Over-Engineering)

This is a test project: we want extensibility where it matters, but we avoid enterprise complexity.

### What we intentionally make extensible
#### A) AI Provider / Model Switching
We encapsulate Gemini calls behind interfaces:

- `VisionSignalExtractor` → implemented by `GeminiVisionSignalExtractor`
- `CatalogReranker` → implemented by `GeminiCatalogReranker`

This allows:
- swapping models
- adding “mock” implementations for tests
- providing future reranking approaches

#### B) Retrieval Strategy Variants
We define retrieval as strategy-like behavior:
- keyword-only retrieval
- attribute-filtered retrieval
- hybrid retrieval (soft filters + text search)

Admin parameters can toggle parts of strategy without code changes.

#### C) Ranking Strategy Variants
We support:
- LLM rerank (Stage 2)
- Heuristic composite scoring
- (future) learned ranking / embeddings external store

We keep it simple: just LLM rerank + heuristic fallback.

---

### What we intentionally do NOT over-engineer
- No microservices
- No message queues
- No multi-tenant config system
- No auth/roles framework
- No complex plugin architecture
- No “clean architecture” ceremony beyond what’s useful

---

### Extensibility Rules of Thumb
- If it affects **matching quality**, make it configurable/extensible.
- If it affects **deployment scale**, keep it minimal for the test.
- Prefer small interfaces over large class hierarchies.
- Add abstractions only after the code proves a seam is needed.

---

## 04.4 Code Standards & Folder Organization

### Monorepo Structure (Recommended)

```

/apps
/web
/src
/components
/pages (or /routes)
/features
/lib (api client, utils)
/styles
/api
/src
/routes
/controllers (optional if separate)
/usecases
/domain
/matching
/models
/services
/infra
/mongo
/gemini
/config
/logger
/config
/utils
/docs
README.md
CHANGELOG.md
docker-compose.yml

````

---

### Backend Folder Details (Intent-Based)

#### `/routes`
- Defines endpoints and route registration
- Minimal logic; delegates to use cases

#### `/usecases`
- Orchestration logic (pipeline)
- Handles fallbacks and timing

#### `/domain`
- Domain types and pure logic
- Retrieval/ranking strategy definitions

#### `/services`
- Glue code between domain and infrastructure
- Sometimes merged with domain depending on taste; keep consistent

#### `/infra`
- External system clients and adapters
- Mongo driver wrapper
- Gemini client wrapper
- Config store

---

### Coding Standards

#### TypeScript
- `strict: true`
- explicit return types for public functions
- avoid `any` (use `unknown` + validation)
- use Zod schemas for AI JSON contracts

#### Error Handling
- Use domain-friendly error types:
  - `ValidationError`
  - `ProviderError`
  - `DatabaseError`
  - `TimeoutError`
- API layer maps errors → status codes + user-safe messages

#### Logging
- Structured logs with `searchId`
- Never log API key
- Log durations:
  - stage1Ms, mongoMs, stage2Ms, totalMs
- Optionally log fallback reasons (internal)

#### Naming
- `camelCase` for functions/vars
- `PascalCase` for classes/types/components
- `kebab-case` for docs filenames
- “positive naming” for flags: `enableLLMRerank` not `disableLLMRerank`

---

### API Response Envelope Standard
All endpoints should follow:

```json
{
  "data": { ... } | null,
  "error": { "code": "...", "message": "...", "details": ... } | null,
  "meta": { "searchId": "...", "timings": { ... }, "notices": [ ... ] }
}
````

This standard makes frontend handling consistent and prevents ad-hoc responses.

---

## 04.5 Assumed Tradeoffs & Justifications

### Tradeoff 1 — Two AI Calls per Search (Latency vs Quality)

**Decision**

* Use Gemini 2.5 Flash for extraction + Gemini 3 Flash Preview for rerank.

**Pros**

* Better ranking quality, especially when catalog entries are close.
* Clear conceptual separation: “understand image” vs “choose best catalog items”.

**Cons**

* Higher latency and cost than single-call approaches.

**Mitigation**

* Admin toggles to disable Stage 2
* Limit `TopM` candidates sent to Stage 2
* Truncate descriptions

---

### Tradeoff 2 — No Persistent Vector Index / Embeddings Store

**Decision**

* No persistent embeddings index because MongoDB is read-only.

**Pros**

* Complies with constraints.
* Keeps the system simple and focused.

**Cons**

* Candidate generation may be less “semantic” than vector search.

**Mitigation**

* Use Gemini Stage 1 to produce strong keywords/attributes
* Use broad fallback retrieval to maintain recall
* Use rerank to improve precision

---

### Tradeoff 3 — In-Memory Admin Config (Simplicity vs Persistence)

**Decision**

* Admin config stored in memory by default.

**Pros**

* Very simple; meets requirement that admin exists and affects behavior.
* Avoids introducing database/auth complexity.

**Cons**

* Config resets on server restart.

**Mitigation**

* Document it clearly
* Optional: add a simple JSON file persistence only for local dev/demo (explicitly “non-prod”)

---

### Tradeoff 4 — Minimal Auth / No Roles

**Decision**

* Do not implement auth for this test unless required.

**Pros**

* Avoids irrelevant complexity.
* Keeps focus on matching quality.

**Cons**

* Admin access is not protected robustly.

**Mitigation**

* Add a minimal “admin gate”:

  * environment variable token
  * hidden route
  * simple header check
* Document it in README as “demo-only security”

---

### Tradeoff 5 — Deterministic Heuristic Fallback vs Always LLM

**Decision**

* If Stage 2 fails, use heuristic scoring for stability.

**Pros**

* System remains functional under provider failures.
* Predictable behavior and easier testing.

**Cons**

* Heuristic ranking may be weaker in ambiguous cases.

**Mitigation**

* Keep weights tunable via Admin
* Keep candidate pool sufficiently broad

---

## End State Expectations

This architecture should enable:

* Clear explanation in a live demo (simple pipeline)
* High-quality relevance ranking (two-stage AI)
* Configurable experimentation via Admin
* Robustness through fallbacks
* Clean code organization aligned with Node/React best practices