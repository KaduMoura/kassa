# 08 — Database & Queries (MongoDB Read-only)

This document describes how the backend interacts with the **read-only MongoDB catalog**, focusing on:
- secure connection practices for a read-only credential
- query strategy for **candidate generation** (recall-first)
- pagination/filtering/sorting patterns (where applicable)
- performance considerations **without creating or changing indexes**
- robust TypeScript models and runtime validation

The key constraint is absolute:
> **The database is read-only.**  
> We must not write, update, create indexes, or modify schema.

---

## 08.1 Connection and Security (Read-only)

### 08.1.1 Connection String Handling
- Store the MongoDB URI in environment variables only:
  - `MONGO_URI=mongodb+srv://...`
- Never commit secrets to the repository.
- Provide `.env.example` with a placeholder value.

**Rules**
- Do not log the connection string.
- Do not expose connection configuration in API responses.
- Ensure the application fails fast on missing `MONGO_URI`.

---

### 08.1.2 Read-only Enforcement (Application-side)
Even if credentials are read-only, the application should adopt defensive guardrails:
- Use a **catalog repository** that exposes only read methods:
  - `findCandidates(...)`
  - `findByIds(...)` (optional)
- Avoid importing `insertOne`, `updateOne`, etc. in business code.
- Keep Mongo client wrapper in `infra/mongo/` only.

**Intent**
This prevents accidental writes and clarifies to reviewers that the system respects constraints by design.

---

### 08.1.3 Connection Lifecycle and Pooling
Use a singleton client per backend process.

**Guidelines**
- Instantiate MongoClient once at server boot.
- Reuse the client across requests.
- On process termination, close the client gracefully.

**Why**
- Avoid overhead of reconnecting per request.
- Keep performance stable under multiple searches.

---

### 08.1.4 Permissions and Attack Surface
Since this is a demo/test application:
- Avoid exposing any generic “Mongo query” endpoint.
- Keep API endpoints high-level (`/search`, `/config`).
- Apply basic CORS restrictions (production-like defaults).
- Consider a minimal rate limiting on `/search` to prevent abuse.

---

### 08.1.5 Data Privacy Considerations
The catalog contains product data (not user data), but still:
- Avoid dumping entire documents back to UI.
- Return only required fields.
- Truncate descriptions where needed.
- Avoid exposing internal Mongo metadata if not needed.

---

## 08.2 Query Strategy for Candidate Set

Candidate generation must be **high recall** and robust to uncertainty.

### 08.2.1 Core Problem
Given:
- extracted signals from image (category/type/keywords/attributes + confidence)
- optional user prompt (refinement constraints)
We need:
- a bounded set of plausible catalog candidates (`TopN`)
- without knowing which indexes exist

---

### 08.2.2 Retrieval Inputs (Normalized)
The query builder should operate on a normalized retrieval input object:

- `category?: string`
- `type?: string`
- `keywords: string[]` (from vision + prompt)
- `softFilters: { priceRange?, dimsRange? }` (prefer ranking, not filtering)
- `confidence: { category, type }`
- `qualityFlags: { multipleObjects, lowConfidence, notFurnitureLikely }`

---

### 08.2.3 Retrieval Plans (Confidence-driven Ladder)
Use a ladder approach so you can relax constraints automatically.

#### Plan A — Confident Category + Type (Most precise)
**When**
- `categoryConfidence >= thresholdCategory`
- `typeConfidence >= thresholdType`

**Query shape**
- filter by `category` and/or `type`
- add keyword search bias on `title/description`

**Expected outcome**
- Smaller but more precise set; still bounded by `TopN`.

---

#### Plan B — Confident Category, Uncertain Type
**When**
- category confidence high, type confidence low

**Query shape**
- filter by `category`
- keywords drive matching

---

#### Plan C — Low confidence / Ambiguous image (Recall-first)
**When**
- low confidence, multiple objects, partial image

**Query shape**
- avoid strict filters on category/type
- rely on keywords and prompt terms
- broaden if too few candidates

---

### 08.2.4 Keyword Matching Strategy (Index-agnostic)
Because we cannot assume a text index exists, implement two approaches:

#### Approach 1 — `$text` search (if available)
If a text index exists on `title/description`, the query can use:
- `{ $text: { $search: "<keywords>" } }`

**Pros**
- Typically fast and relevant.

**Cons**
- Not guaranteed to exist.

**Implementation note**
Since we can’t inspect indexes easily in read-only mode (and shouldn’t rely on it),
we can implement:
- a configurable `USE_TEXT_SEARCH=true` toggle
- or a try-catch fallback (if query fails, revert to regex/or strategy)

---

#### Approach 2 — Regex `$or` fallback (Careful use)
When `$text` is not available, use:
- `$or` conditions on `title` and `description` with a **small set of keywords**
- prefer a small number of regex terms (e.g., top 3–6)

**Guardrails**
- Avoid unbounded scans:
  - always set `limit`
  - always set projection
  - avoid too many `$or` regex branches
- If performance becomes an issue:
  - reduce keywords
  - use category filtering when confidence allows

---

### 08.2.5 Query Relaxation Rules (Never return “nothing” too easily)
Define a minimum candidate threshold:
- `minCandidates` (e.g., 10)

If candidates returned < `minCandidates`, relax progressively:

1) category + type + keywords
2) category + keywords
3) keywords only
4) prompt keywords only
5) return empty state with guidance (final fallback)

This ladder is essential for a good user experience and better match coverage.

---

### 08.2.6 Projection and Compactness
Always project only what you need:

- `_id`
- `title`
- `description`
- `category`
- `type`
- `price`
- `width`
- `height`
- `depth`

Never return extra fields unless you confirm they exist and are needed.

**Reason**
- keeps response size small
- reduces memory usage
- improves speed for reranking input

---

### 08.2.7 Candidate De-duplication
Candidate sets should be unique by `_id`.
If the query strategy uses unions or multiple queries:
- deduplicate in application layer
- keep stable ordering (deterministic tie-breakers)

---

## 08.3 Pagination, Filters, and Sorting

This is not a consumer e-commerce, so we keep these minimal.

### 08.3.1 Pagination
For the core search flow:
- return a fixed `TopK` results (e.g., 10)
- optionally return `candidatesCount` and allow “Show more” later

If you implement “Show more results”:
- keep it **client-driven** with a `cursor` or `offset`
- but avoid deep pagination complexity

**Recommended minimal approach**
- search returns TopK only
- do not implement paged results unless time permits

---

### 08.3.2 Filters (End-user vs Admin)
End-user UI should not expose complex filters; prompt handles refinements.

Admin may expose:
- candidateTopN
- confidence thresholds
- weight tuning

If you implement explicit filters later:
- treat them as **soft constraints** used in ranking rather than hard Mongo filters, to avoid empty results.

---

### 08.3.3 Sorting
Default sorting for users:
- Relevance (final ranking order)

Optional client-side sorts (not DB sorts):
- Price
- Width
- Height
- Depth

**Reason**
- DB sorting can be expensive without indexes
- ranking order is the core outcome of the system

If you do sort in DB for a fallback query:
- use it sparingly and document it
- always bound with `limit`

---

## 08.4 Performance Considerations (Without Altering Indexes)

### 08.4.1 Constraints
- We cannot add indexes or change schema.
- We must build queries that are resilient even if indexes are unknown.

---

### 08.4.2 Core Performance Principles

#### A) Keep queries bounded
- Always set `limit` (`candidateTopN`)
- Always set projection
- Avoid returning entire documents

#### B) Minimize regex scans
- Use regex fallback only when needed
- Keep regex keyword list short
- Prefer category filtering when confidence is high

#### C) Use timeouts
- Apply a Mongo operation timeout (application-level or driver-level)
- If query exceeds timeout:
  - fall back to a simpler query plan (e.g., category-only or prompt-only)
  - or return a friendly error

#### D) Reduce candidate context size for rerank
- Truncate `description` before sending to Gemini 3
- Use topM pre-ranked candidates only

#### E) One query, not many
- Prefer a single query per request where possible.
- If you implement multi-query union strategies, ensure:
  - each query is limited
  - combined results are capped and deduplicated

---

### 08.4.3 Caching Strategy (Optional)
Given the assessment scope, caching is not required.

If added, keep it minimal:
- in-memory cache of recent `searchId → candidates` (short TTL)
- do NOT cache API key
- do NOT cache raw images (unless hashed and explicitly documented)

Caching should be framed as:
- a performance optimization for repeated runs during demo/eval
- not a production-grade caching system

---

### 08.4.4 Handling Mongo Connectivity Issues
Common issues:
- DNS resolution failures
- connection pool exhaustion (if misconfigured)
- network timeouts

Expected behavior:
- classify as `DB_UNAVAILABLE`
- return user-friendly “try again” message
- log details with requestId

---

## 08.5 TypeScript Models and Data Validation

### 08.5.1 Why Runtime Validation is Needed
Even with a known schema, real-world catalogs can contain:
- missing fields
- wrong types (string instead of number)
- null values
- inconsistent casing and formatting

This can break ranking and rerank prompt formatting.

---

### 08.5.2 TypeScript Types (Compile-time)
Define canonical types:

```ts
export type Product = {
  id: string; // derived from _id
  title: string;
  description: string;
  category: string;
  type: string;
  price: number;
  width: number;
  height: number;
  depth: number;
};
````

Also define variants:

* `CandidateProduct` (same but description maybe truncated)
* `CandidateSummary` (compact for reranker)

---

### 08.5.3 Zod Schemas (Runtime)

Use Zod to validate documents read from Mongo:

* required fields must exist
* numbers must be numbers
* strings must be strings

If a document fails validation:

* discard it from candidates
* log a debug entry with `requestId` and `productId`
* do not fail the entire request (unless too many invalid docs cause empty results)

---

### 08.5.4 Normalization Rules

Apply consistent normalization after validation:

#### Text normalization

* trim
* collapse spaces
* optionally lowercase for matching features (keep original for display)

#### Numeric normalization

* if missing or invalid numeric values:

  * treat as “unknown” and neutralize scoring contribution

---

### 08.5.5 Defensive Formatting for Rerank Input

When building candidate summaries for Gemini 3:

* truncate descriptions
* ensure no undefined values leak
* include only safe, short fields

Candidate summary shape should be stable and predictable.

---

## Expected Outcome

Implementing this MongoDB read-only strategy ensures:

* Secure, correct use of a read-only catalog
* High-recall candidate generation under uncertain signals
* Stable behavior even without knowledge of indexes
* Bounded performance characteristics (limits, projections, timeouts)
* Strong TypeScript safety through runtime validation
* Clean data formatting that improves reranking quality and prevents crashes