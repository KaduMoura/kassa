# 01 - Project Overview (Complete — Two-Stage Gemini Strategy)

This document describes the overall vision of the system to be built for the **Image-Based Product Search** test: a focused full-stack application (not an e-commerce platform) that receives an image of a furniture item, queries an existing catalog (MongoDB **read-only**), and returns **relevance-ranked matches**, with optional natural language refinement and an **Admin** area to adjust retrieval/ranking parameters.

The architecture will adopt a **two-stage AI pipeline**:

- **Stage 1 — Gemini 2.5 Flash**: Structured signal extraction from the image (attributes, probable category/type, etc.)
- **Stage 2 — Gemini 3 Flash Preview**: Catalog-aware re-ranking among candidates retrieved from MongoDB

---

## 01.1 Test Objective and Success Criteria

### Test Objective
Build an application capable of:

1. **Receiving image upload** of a furniture item.
2. **Analyzing the image** using AI to extract useful signals (descriptors, attributes, category/type, materials, style, etc.).
3. **Fetching candidates** from the existing catalog (MongoDB read-only) without modifying the database.
4. **Ranking results** to return the most relevant items based on the uploaded image.
5. **Optionally refining** the search with a textual query (“smaller gray sofa”, “Scandinavian style”, etc.).
6. Including an **Admin (back-office)** to configure meta-parameters that impact retrieval and ranking (topK, weights, thresholds, strategy, etc.).
7. **Documenting** choices, trade-offs, and quality evaluation methodology in the README.
8. Including a **CHANGELOG** with key decisions and milestones (including relevant coding-agent prompts when applicable).

### What Will Be Evaluated (Practical Interpretation)

Evaluation focuses on **match quality and relevance**, not just returning results. The system must prioritize:

- **Top-5/Top-10 relevance**
- **Consistent ranking behavior** under small variations
- **Pipeline robustness** (graceful degradation under failures/poor inputs)
- **Architectural clarity** and separation of concerns
- **Useful Admin controls**, capable of altering behavior without code changes

### Success Criteria (Objective/Verifiable)

#### (A) Core Functionality
- Image upload with validation (type/size) and preview
- Search execution (image + optional prompt)
- Ranked list displaying catalog fields: `title`, `category`, `type`, `price`, `width/height/depth`

#### (B) Matching Quality (Primary)
In a test set (even manual):

- Same-family items appear at the top (sofa↔sofa, chair↔chair, etc.)
- Essential attributes are captured when possible (e.g., armrest vs. armless; coffee table vs. dining table)
- User prompt noticeably improves results

#### (C) Admin Truly Controls the System (No Code Changes)
- Changing parameters in Admin **modifies retrieval/ranking behavior** immediately (or on next request), without redeploying or editing code.

#### (D) User API Key (Runtime, In-Memory Only)
- The application accepts an API key at runtime and **does not persist it to disk**
- The key **never appears in logs** and is never committed
- It may remain in client-side or server-side memory, but never persistently stored

#### (E) Documentation and Reproducibility
README must include:
- How to run locally
- System overview
- Architectural decisions and trade-offs (especially retrieval/ranking)
- Matching quality evaluation methodology
- Next steps

CHANGELOG must include:
- Major changes and motivation
- Evolution of the matching strategy
- Relevant prompts used during development

---

## 01.2 Scope (In-Scope / Out-of-Scope)

### In-Scope

#### Required Functionalities
- Image upload via UI
- Product matching: image analysis + catalog search + ranking
- Optional refinement prompt
- Admin page/tab with configurable parameters
- Basic error handling and empty states
- README + CHANGELOG

#### Minimum Technical Components
- **Backend Node.js + TypeScript (REST)**
  - Search endpoint (multipart, containing image + prompt + params)
  - AI → Mongo → ranking pipeline orchestration
  - Admin endpoint(s) for reading/updating parameters
- **Frontend React + TypeScript**
  - Main page (upload + prompt + results)
  - Admin page/tab (configuration)
  - API key stored only in memory (state)

#### What Qualifies as Acceptable Matching
Even without perfect computer vision, the system must implement a consistent strategy for:

- **Candidate generation** (initial plausible set from Mongo)
- **Re-ranking** (reproducible ordering strategy)

### Out-of-Scope

- Authentication/multi-user roles
- Robust Admin persistence (may be in-memory; if persisted, simple and explicit)
- External storage uploads (S3/GCS)
- Modifying MongoDB indexes/schema (forbidden)
- Persisting embeddings in the catalog (database cannot be altered)
- Full e-commerce features (cart/checkout)
- Advanced observability (full OpenTelemetry)
- Enterprise-scale production infrastructure (K8s/multi-region)

### Explicit Assumptions

- The catalog is pre-populated and read-only
- Product schema includes: `title`, `description`, `category`, `type`, `price`, `width`, `height`, `depth`
- Image quality varies; the system must handle failures and low-confidence inputs

---

## 01.3 High-Level Architectural Decisions

### Macro View (KISS Principle)

Keep architecture simple (avoid microservices for the test). Recommended: **monorepo** with `apps/web` and `apps/api`.

Main flow:
Frontend → Backend → Gemini 2.5 (vision) → MongoDB (candidates) → Gemini 3 (rerank) → Frontend

### Separation of Responsibilities (Layers)

Backend structure:

1. **API Layer (routes/controllers)**
   - HTTP handling, validation, status codes, response contracts

2. **Application Layer (use-cases)**
   - Pipeline orchestration:
     - `parseImageSignals()`
     - `buildMongoQuery()`
     - `fetchCandidates()`
     - `rerankCandidates()`
     - `formatResults()`

3. **Domain/Services (Matching)**
   - Retrieval and ranking strategies
   - AI abstractions (Vision and Rerank)

4. **Infrastructure**
   - Mongo client
   - Gemini client
   - Config store (Admin params)
   - Logger/sanitization

---

## 01.4 Matching Pipeline (Two Stages)

### Stage 1 — Vision Signal Extraction (Gemini 2.5 Flash)

Objective: transform the image into structured, searchable signals.

**Expected Output (Schema-Validated JSON):**
- `category_guess` (string + confidence)
- `type_guess` (string + confidence)
- `attributes` (color, material, style, shape, armrests/chaise presence, etc.)
- `keywords` for textual search
- `constraints` inferred from prompt (if provided)
- `quality_flags` (e.g., “not furniture”, “multiple objects”, “low confidence”)

Validation:
- Zod (or equivalent) to enforce format and enable fallback strategies

Fallback:
- If failure or low confidence, perform broad search without strict filters

---

### Stage 2 — Catalog-Aware Re-ranking (Gemini 3 Flash Preview)

Objective: reorder candidates using contextual understanding of the returned catalog items.

Input:
- Stage 1 structured JSON
- Compact list of Top N Mongo candidates (truncated fields)

Output:
- Ordered Top K list
- (Optional) per-item `score` and short explanation

Controls:
- Limit candidate count sent to LLM
- Truncate `description`
- Allow disabling LLM rerank via Admin (“heuristic-only mode”)

---

## 01.5 Retrieval and Ranking Strategy

### Candidate Generation (MongoDB Read-Only)

Objective: retrieve a plausible initial set using only existing indexes.

Signals:
- `category/type` (if high confidence)
- `keywords` (title/description)
- User prompt (if present)

Rules:
- Apply soft filters when confidence is high
- Use broad search when confidence is low
- Always implement fallback to avoid empty results

---

### Ranking (Composite Score + LLM Rerank)

Final ranking may combine:

- Text similarity (keywords vs title/description)
- Category/type match
- Dimension heuristics when prompt requests size
- Prompt adjustments (color/style preferences)
- Configurable weights (Admin)

Gemini 3 acts as the qualitative final layer for resolving ambiguity among close candidates.

---

## 01.6 Admin (Back-Office) as Experimentation Surface

Admin exposes meta-parameters controlling retrieval/ranking:

- `candidateTopN`
- Score weights (text vs category/type vs dimensions)
- Confidence thresholds
- Fallback breadth strategy
- `enableLLMRerank`
- `llmRerankTopM`
- `maxDescriptionChars`
- Timeouts and retries

---

## 01.7 User API Key Policy and Flow

- User inputs API key via UI
- Sent to backend per request (e.g., `X-API-KEY`) or kept client-side depending on design
- Never persisted to disk/database
- Logs must sanitize and exclude the key

---

## 01.8 Quality Evaluation (README + Optional Lightweight Mechanism)

README must document:

- Small manual test image set
- Evaluation criteria: correct category, essential attributes, improvement with prompt

Optional:
- “Eval mode” in Admin:
  - Store queries + results + manual notes in memory
  - Export JSON
  - Simple metrics: hit@K per category

---

## 01.9 Edge Cases (Graceful Degradation)

Handle properly:

- Unrecognizable/non-furniture image
- AI provider failure (timeout/429)
- No candidates
- Contradictory prompt

Behavior:
- Clear user messaging
- Broad fallback search
- Suggestions (“try another photo”, “add description”)

---

## 01.10 Stack and Repository Conventions

### Stack Alignment

Frontend:
- React + TypeScript
- Vite or Next.js

Backend:
- Node.js + TypeScript
- Fastify or Express (NestJS optional)

AI:
- Google Gemini API (two stages)
- Optional LangChain

Database:
- Official MongoDB driver (read-only)

Tooling:
- ESLint + Prettier
- Vitest/Jest
- Docker + docker-compose
- Basic CI (lint/test/build)

---

### Repository Structure (Suggestion)

Monorepo:
- `apps/web`
- `apps/api`
- `docs/`
- `README.md`
- `CHANGELOG.md`
- `docker-compose.yml`

---

### Code Conventions

- TypeScript strict mode enabled
- Backend folders:
  - `src/routes`
  - `src/usecases`
  - `src/services`
  - `src/infra`
  - `src/config`
- Naming:
  - `camelCase` (functions/variables)
  - `PascalCase` (components/classes)
  - `kebab-case` (docs)

---

### API Conventions

Standard response:
- `{ data, error, meta }`

Errors:
- `{ code, message, details }`

---

### Commits and CHANGELOG

- Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`
- CHANGELOG tracks:
  - Matching milestones
  - Rerank evolution
  - Relevant prompts

---

### Repository Security

- Never commit real `.env`
- Include `.env.example`
- Sanitize logs
- Validate uploads (type/size)
- Basic rate limiting (optional)

---

## Expected Outcome

By the end of this document, it should be clear:

- What the test goal is and how to succeed
- What will be delivered and what will not
- How the solution is structured (front/back/AI/Mongo)
- How retrieval and ranking operate (two stages)
- Which parameters Admin controls and why
- How matching quality is evaluated
