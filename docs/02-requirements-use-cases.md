# 02 — Requirements & Use Cases

This document defines the **requirements** (functional and non-functional) and the key **use cases** for the Image-Based Product Search system.  
It is written to be directly actionable for implementation and to clarify what the system must do, how it must behave, and how to reason about edge cases.

> Primary evaluation focus: **match relevance and ranking quality**, not merely returning any results.

---

## 02.1 Functional Requirements (Core)

### FR-001 — Image Upload (User)
**Description**  
The system must allow a user to upload an image of a furniture item as the primary search input.

**Acceptance Criteria**
- User can select a local image file (drag & drop and/or file picker).
- System validates:
  - supported formats (e.g., JPG/PNG/WebP)
  - maximum file size (configurable)
  - optionally minimum dimensions (configurable)
- UI shows image preview and allows replace/remove before search.
- Search cannot run without a valid image.

---

### FR-002 — Optional Text Prompt (User)
**Description**  
The system must allow the user to provide an optional natural language prompt to refine the search.

**Acceptance Criteria**
- Prompt input is optional; empty is valid.
- Prompt has a max length (configurable).
- Prompt is sent with the search request and can influence retrieval and ranking.
- Prompt can express:
  - preferences (style, color, material)
  - constraints (price, size)
  - disambiguation (type/category)
  - negative constraints (exclude materials/styles)

---

### FR-003 — Two-Stage AI Matching Pipeline
**Description**  
The backend must implement a two-stage AI pipeline:

- **Stage 1 (Gemini 2.5 Flash)**: structured signal extraction from the image
- **Stage 2 (Gemini 3 Flash Preview)**: catalog-aware re-ranking among candidates from MongoDB

**Acceptance Criteria**
- Stage 1 produces schema-validated JSON signals used for candidate retrieval.
- Candidate retrieval returns a bounded list of candidates from MongoDB.
- Stage 2 consumes candidates + signals and outputs a final ranked list.
- The pipeline supports graceful fallback (see FR-008).

---

### FR-004 — Candidate Retrieval From MongoDB (Read-Only)
**Description**  
The system must retrieve candidate products from the provided MongoDB catalog without modifying the database.

**Constraints**
- The database is **read-only**.
- The system must not modify documents, schema, or indexes.

**Acceptance Criteria**
- Connect using the provided connection string.
- Query the `products` collection.
- Use existing indexes only (unknown/assumed; must handle efficiently).
- Return candidate list using only fields:
  - `title`, `description`, `category`, `type`, `price`, `width`, `height`, `depth`

---

### FR-005 — Ranked Results Output (User)
**Description**  
The system must return a **ranked** list of products as search results.

**Acceptance Criteria**
- Results are ranked by relevance (best match first).
- Each result includes:
  - `title`
  - `category`
  - `type`
  - `price`
  - `width`, `height`, `depth`
  - optionally a short `description` snippet (truncated)
- The number of results is configurable (default top-K).
- Results are displayed in a consistent UX format.

---

### FR-006 — Admin Configuration Surface
**Description**  
The client must include an Admin page/tab for configuring meta-parameters that control retrieval and ranking behavior.

**Acceptance Criteria**
Admin UI allows reading/updating parameters such as:
- Retrieval:
  - `candidateTopN`
  - confidence thresholds for applying filters
  - keyword strategy toggles
- Ranking:
  - weights for signals (type/category/text/dimensions)
  - enable/disable Gemini rerank (`enableLLMRerank`)
  - `llmRerankTopM` (how many candidates sent to Stage 2)
  - truncation limits (`maxDescriptionChars`)
- Operational controls:
  - timeouts, retries (within reason)

Admin changes must take effect without code changes.

---

### FR-007 — Runtime API Key Handling (In-Memory Only)
**Description**  
The app must accept a user-provided AI API key at runtime and store it **only in memory**.

**Acceptance Criteria**
- User can input API key in UI (or settings modal).
- Key is used only for current session requests.
- Key is not persisted:
  - no database storage
  - no file storage
  - no commit to repo
- Key does not appear in logs or error messages.
- Refreshing the page clears the key (unless “in-memory session” is simulated carefully without persistent storage).

---

### FR-008 — Graceful Degradation & Fallback Behavior
**Description**  
The system must continue functioning when some stages fail, favoring “best-effort results” over hard failure.

**Acceptance Criteria**
- If Stage 1 fails or returns invalid JSON:
  - use broad retrieval with minimal assumptions (fallback query)
- If Stage 2 rerank fails:
  - return heuristic-ranked candidates
- If Mongo query fails:
  - show user-friendly error and allow retry
- System must surface a minimal notice when fallback is used (non-technical).

---

### FR-009 — Lightweight Evaluation Approach (Documented)
**Description**  
The README must document how to evaluate match quality, and the system should support an optional lightweight evaluation mechanism.

**Acceptance Criteria**
- README includes:
  - definition of relevance
  - small test set strategy (manual or curated)
  - metrics or qualitative scoring approach (top-K quality)
- Optional: admin “Eval mode” can store results and allow export.

---

### FR-010 — Deliverables
**Description**  
The repository must include all required deliverables.

**Acceptance Criteria**
- Git repo with full code
- `README.md` with:
  - run instructions
  - system overview & key decisions
  - tradeoffs
  - evaluation approach
  - recommended future enhancements
- `CHANGELOG.md` capturing development evolution and key prompts

---

## 02.2 Non-Functional Requirements (Quality, Performance, DX)

### NFR-001 — KISS / DRY / Separation of Concerns
- Architecture must remain simple (avoid unnecessary microservices or heavy frameworks).
- Shared logic should be extracted (avoid duplication).
- Clear boundaries between:
  - API handling
  - matching pipeline logic
  - infrastructure clients

---

### NFR-002 — Performance & Latency Targets
Because the system calls AI models, response time is critical.

**Targets (guidelines)**
- Typical search should complete within a reasonable time window (e.g., 3–10 seconds depending on model latency).
- UI must display progress indicators quickly (<200ms after submit).
- Candidate retrieval should be fast relative to AI calls.

**Constraints**
- Limit candidate list size for Stage 2.
- Truncate large fields before sending to Gemini 3.

---

### NFR-003 — Reliability & Robustness
- Retries should be bounded (no infinite retry loops).
- Timeouts must be enforced per AI call and per overall request.
- Fallback behavior must be deterministic and predictable.

---

### NFR-004 — Security & Privacy
- API key never persisted.
- Logs sanitized.
- Upload validation enforced (type/size).
- Avoid exposing stack traces to users.
- Prefer server-side calls to AI to reduce key exposure (unless explicitly designed otherwise).

---

### NFR-005 — Maintainability & Testability
- Business logic should be testable independently of AI providers (use mocks).
- Provide unit tests for:
  - query building
  - scoring/weighting logic
  - fallback decisions
- Provide integration tests for API endpoints (minimum viable).

---

### NFR-006 — Developer Experience (DX)
- One-command local run (via `docker-compose` or `pnpm dev`).
- `.env.example` with required variables.
- Clear scripts for lint/test/build.
- Minimal setup friction for reviewers.

---

### NFR-007 — Observability (Basic)
- Structured logging with correlation id (`searchId`).
- Log key pipeline timings:
  - Stage 1 duration
  - Mongo query duration
  - Stage 2 duration
- Optional: internal debug output visible in Admin only.

---

## 02.3 Use Cases (End User)

### UC-USER-001 — Search by Image Only
**Actor:** end user  
**Trigger:** user uploads an image and clicks Search  
**Main Flow:**
1. Upload image
2. (No prompt)
3. Backend runs Stage 1 → Mongo → Stage 2
4. User sees ranked results

**Success Outcome:**
- Top results match the furniture type and general appearance.

---

### UC-USER-002 — Search by Image + Prompt Refinement
**Actor:** end user  
**Trigger:** user uploads image, enters prompt, clicks Search  
**Main Flow:**
1. Upload image
2. Enter prompt (e.g., “smaller, under $300, light wood”)
3. System uses prompt to adjust retrieval and ranking
4. User sees refined ranked results

**Success Outcome:**
- Results align with image and the prompt constraints as much as possible.

---

### UC-USER-003 — Replace Image and Re-run Search
**Actor:** end user  
**Trigger:** user changes image after seeing results  
**Main Flow:**
1. Replace image
2. Keep or change prompt
3. Re-run search
4. View new results

**Success Outcome:**
- New results reflect new image input, not previous run.

---

### UC-USER-004 — Retry After Failure
**Actor:** end user  
**Trigger:** AI provider timeout / network error  
**Main Flow:**
1. Search fails
2. User clicks “Try again”
3. System retries with same inputs and parameters

**Success Outcome:**
- User sees results or a clearer actionable message.

---

### UC-USER-005 — Get Best-Effort Results Under Low Confidence
**Actor:** end user  
**Trigger:** blurry/ambiguous image  
**Main Flow:**
1. Search runs
2. Stage 1 returns low confidence
3. System uses fallback broad retrieval
4. Stage 2 reranks or heuristic ranks
5. User sees best-effort results + subtle notice

**Success Outcome:**
- User still receives plausible matches with guidance to improve input.

---

## 02.4 Use Cases (Admin / Back-Office)

### UC-ADMIN-001 — Adjust Retrieval Candidate Pool Size
**Actor:** admin  
**Goal:** change `candidateTopN` to increase/decrease recall

**Main Flow:**
1. Open Admin
2. Adjust candidateTopN (e.g., 30 → 80)
3. Save/apply
4. Run a user search and observe impact

**Success Outcome:**
- System returns more diverse results (higher recall) when increased.

---

### UC-ADMIN-002 — Tune Ranking Weights
**Actor:** admin  
**Goal:** change weights controlling final scoring

**Main Flow:**
1. Open Admin
2. Adjust weights (text vs category/type vs dimensions)
3. Save/apply
4. Re-run searches and compare

**Success Outcome:**
- The ranking order changes predictably based on weight changes.

---

### UC-ADMIN-003 — Enable/Disable LLM Re-rank
**Actor:** admin  
**Goal:** toggle Stage 2 rerank to compare speed vs quality

**Main Flow:**
1. Open Admin
2. Toggle `enableLLMRerank`
3. Re-run search

**Success Outcome:**
- When disabled, ranking uses heuristic-only method, faster but potentially less accurate.

---

### UC-ADMIN-004 — Configure Limits (Truncation, TopM)
**Actor:** admin  
**Goal:** prevent token overflow and reduce cost

**Main Flow:**
1. Adjust `llmRerankTopM` and `maxDescriptionChars`
2. Save/apply
3. Search and verify system remains stable

**Success Outcome:**
- Requests stay within model limits and latency improves.

---

### UC-ADMIN-005 — Evaluation Mode (Optional)
**Actor:** admin/evaluator  
**Goal:** record and export results for a small test set

**Main Flow:**
1. Enable Eval Mode
2. Run searches for curated images
3. Mark results helpful/unhelpful
4. Export JSON report

**Success Outcome:**
- Provides lightweight evidence of quality and iteration.

---

## 02.5 Edge Cases and Expected Behaviors

This section enumerates critical edge cases and the expected system response.

### EC-001 — Unsupported File Type
**Condition:** user uploads HEIC/GIF/etc.  
**Expected Behavior:**
- Block search
- Show validation message
- Allow user to replace file

---

### EC-002 — File Too Large
**Condition:** image exceeds max size  
**Expected Behavior:**
- Block search
- Show “max size” message
- Suggest compressing image

---

### EC-003 — Non-Furniture Image
**Condition:** photo is not furniture (pet, selfie, scenery)  
**Expected Behavior:**
- Show user-friendly warning
- Attempt best-effort search using broad prompt-based fallback (if prompt exists)
- Otherwise show empty state with guidance

---

### EC-004 — Multiple Furniture Items in One Photo
**Condition:** image contains multiple items  
**Expected Behavior:**
- Prefer strongest main object (Stage 1 should signal “multiple objects”)
- Use broad retrieval
- Inform user to upload a clearer single-item photo

---

### EC-005 — Blurry / Low-Light / Low Confidence
**Condition:** Stage 1 returns low confidence  
**Expected Behavior:**
- Use broad retrieval fallback
- If results are poor, suggest better photo and adding a prompt

---

### EC-006 — AI Provider Failure (Timeout/429/5xx)
**Condition:** Gemini call fails  
**Expected Behavior:**
- If Stage 1 fails:
  - fallback broad retrieval (if possible)
- If Stage 2 fails:
  - heuristic-only ranking
- Always show friendly “try again” messaging

---

### EC-007 — Invalid/Unparseable AI Output
**Condition:** model returns malformed JSON  
**Expected Behavior:**
- Attempt one bounded repair (re-prompt) OR parse-recover if safe
- If still invalid:
  - fallback behavior
- Log internally with correlation id

---

### EC-008 — No Mongo Candidates Returned
**Condition:** query too strict or catalog mismatch  
**Expected Behavior:**
- Relax constraints and retry broad retrieval automatically
- If still empty:
  - show empty state with suggestions

---

### EC-009 — Contradictory Prompt
**Condition:** prompt conflicts with image signals  
**Expected Behavior:**
- Prefer image-based intent, use prompt as soft bias
- If results are poor, attempt secondary prompt-driven retrieval
- Provide subtle clarification message

---

### EC-010 — Payload Too Large for Stage 2 Context
**Condition:** candidate list too large / descriptions too long  
**Expected Behavior:**
- Truncate fields
- Reduce `TopM`
- Optionally skip Stage 2 with heuristic ranking
- Indicate fallback in Admin debug (optional)

---

## End of Document
This requirements and use-case specification ensures:

- The system meets the test’s explicit deliverables
- Matching quality remains the primary focus
- Admin can tune retrieval/ranking without code changes
- Failures degrade gracefully with best-effort results
- Implementation remains simple, clean, and defendable in a live demo
