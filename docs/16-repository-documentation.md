# 16 — Repository Documentation

This section defines what the repository documentation must contain, how it should be structured, and what level of detail is expected so that a reviewer can (1) run the project quickly, (2) understand the matching approach, and (3) assess engineering judgment and tradeoffs.

The two primary deliverables here are:
- `README.md` — “how to run” + “what it does” + “why it was built this way”
- `CHANGELOG.md` — “what changed over time and why”, with emphasis on retrieval/ranking and the prompts used with coding agents

---

## 16.1 README: How to run locally

### 16.1.1 Audience and Goals
The README must optimize for a technical reviewer who:
- wants to run the app in under ~5 minutes
- may not have your exact tooling
- will test with a few images and prompts
- will likely inspect code right after running it

Therefore the README should:
- provide a **fast path** (Docker or pnpm)
- provide a **fallback path** if Docker fails (or vice versa)
- list prerequisites clearly and succinctly
- provide known troubleshooting tips

---

### 16.1.2 Minimum README “Run Locally” Sections

#### A) Prerequisites
- Node version (e.g., `Node >= 20`)
- Package manager (pnpm recommended)
- Docker (optional, but recommended for a clean demo)
- Browser requirements (any modern browser)
- **No required AI keys at startup** — since key is entered in the UI at runtime

Example content:
- “This project requires Node 20+ and pnpm.”
- “Optionally, you can run using Docker Compose.”

#### B) One-command Demo (Docker)
Provide a single, copy-paste command:
- `docker compose up --build`
Then list:
- Web URL
- API URL
- Admin URL (or tab)

Include expected output signals:
- “API listening on :4000”
- “Web served on :8080”

Add a “First run” checklist:
- open app
- paste AI provider key (in the UI)
- upload an image
- verify results

#### C) Local Dev (pnpm)
Provide a step-by-step:
1. `pnpm install`
2. `pnpm dev` (or `pnpm -r dev` in a monorepo)
3. open URLs (web + api)

List expected ports and how to change them.

#### D) Required Environment Variables
Even if the DB is remote and read-only, the backend must know where to connect.

Add a `.env.example` snippet in README and link to it:
- `MONGO_URI=...`
- `PORT=4000`
- `CORS_ORIGIN=http://localhost:5173` (or whatever)
- provider defaults (model name, timeouts) that are safe to set without secrets

Make it explicit:
- user AI key is never stored on disk
- key is provided at runtime in the UI and stored only in memory

#### E) Common Issues (Troubleshooting)
Include a short “If something breaks” section, e.g.:
- Mongo connection errors (network/firewall, wrong URI)
- CORS issues (origin mismatch)
- 413 upload too large (image size limit)
- AI provider errors (invalid key, quota, timeouts)
- Docker build fails (node version mismatch, lockfile mismatch)

Keep it practical: symptom → likely cause → fix.

---

### 16.1.3 “Golden Path” Demo Script (Inline)
Many reviewers appreciate a short “demo script” inside README:

1. Go to the main page
2. Enter your AI key (stored in memory)
3. Upload an image of a furniture item
4. (Optional) add a prompt like “in walnut wood, minimalistic”
5. Review top results + explanation hints
6. Open Admin tab and tune:
   - candidate set size
   - re-ranking weights
   - prompt usage toggle
7. Re-run the same image to see how ranking changes

This increases the chance they explore your “admin/back-office” requirement.

---

## 16.2 README: System overview and design decisions

### 16.2.1 What Reviewers Want to Learn Here
This is the “why” section:
- What pipeline you built for matching
- How retrieval and ranking work end-to-end
- What signals you use (image/text/metadata)
- What you chose not to do (and why)
- How admin tuning changes behavior

Keep it concise but technically sharp. Avoid vague statements like “we used AI to match images”.

---

### 16.2.2 Recommended README Structure (Overview)

#### A) Problem Statement
A paragraph that restates the goal:
- “Image-based furniture matching with optional query refinement, returning ranked matches from a read-only Mongo catalog.”

#### B) Architecture (macro)
A simple diagram or bullet flow:
- Frontend (React) → API (Node) → Mongo read-only
- API → AI provider (vision + text) for:
  - extracting structured signals
  - producing ranking features
  - optional re-ranking
- Admin UI → config endpoints → in-memory config store

#### C) Matching Pipeline (the heart of the README)
Explain the stages:
1. **Input normalization**
   - image validation, optional user query cleanup
2. **Vision extraction**
   - detect furniture type/category, materials/colors, style keywords
   - optionally approximate dimensions if visible (low confidence)
3. **Candidate generation**
   - query Mongo using extracted type/category keywords
   - add broad fallbacks if uncertain
4. **Scoring**
   - compute a weighted score per candidate using:
     - text similarity (title/description)
     - metadata match (category/type)
     - numeric compatibility (price and dimensions proximity)
     - style/material matches
5. **AI-assisted re-ranking (optional)**
   - run top-N candidates through a smaller re-rank prompt
6. **Explainability**
   - return short “why matched” bullets

Make it clear which steps are deterministic vs AI-assisted.

#### D) Admin Controls
Explain:
- what knobs exist
- why each knob matters
- what safe ranges look like
- how config affects results immediately

#### E) Performance Notes
- Candidate generation is designed to keep AI cost low by reducing rerank set size.
- Response latency is dominated by AI calls; fallback paths avoid “hard failure”.

#### F) Security Notes
- user API key stored only in memory
- never logged
- image stored only transiently

---

### 16.2.3 “Key Decisions” Section (Explicit Tradeoffs)
Add a short list, like:
- “No vector database introduced (KISS).”
- “Mongo queries rely on existing indexes only.”
- “AI output validated with schemas to avoid prompt drift.”
- “Reranking is optional and tunable; baseline ranking works without reranker.”

Reviewers love explicit decision framing.

---

## 16.3 README: Quality evaluation (methodology)

### 16.3.1 Why This Belongs in README
The assessment explicitly evaluates match relevance. Your README should demonstrate you know how to measure it.

---

### 16.3.2 Offline Evaluation: “Golden Set”
Describe:
- a small curated set of (image, query, expected top results)
- stored in repo as metadata (not the actual proprietary images unless allowed)
- or stored as local-only images with instructions

Explain how you created it:
- pick diverse items:
  - sofa, chair, table, bed, cabinet
  - different styles/materials
  - different angles/backgrounds

---

### 16.3.3 Metrics
Keep it lightweight but real:
- Top-K accuracy (e.g., “did we get a relevant match in top 5?”)
- MRR (mean reciprocal rank)
- NDCG@K (optional, if you have graded relevance)

Explain what “relevant” means:
- same type/category is minimum
- style/material similarity increases relevance
- dimension proximity is a bonus if known

---

### 16.3.4 In-App Lightweight Signals
If implemented:
- thumbs up/down on results
- store evaluation events (no secrets) with:
  - requestId
  - timestamp
  - config snapshot
  - chosen result rank
  - optional free-form feedback

Even if you don’t build it, describe how you would.

---

### 16.3.5 Reproducibility Instructions
Include exact steps to reproduce evaluation:
- how to run the evaluation script
- sample command:
  - `pnpm eval`
- what outputs it prints:
  - table of queries with top-k results
  - summary metrics

---

## 16.4 README: Tradeoffs and next steps

### 16.4.1 Tradeoffs (Be Honest, Show Judgment)
Recommended categories:

#### A) Relevance vs Cost
- More AI calls → higher accuracy but slower and more expensive.
- Approach uses AI for structured extraction + optional rerank, limiting full-catalog AI usage.

#### B) Simplicity vs “Production-grade”
- No persistent config store (in-memory) to meet test scope.
- No auth system; admin uses a lightweight gate.

#### C) Search Quality vs Index Constraints
- You cannot change Mongo indexes, so candidate generation must adapt.
- You rely on existing text fields and simple filters.

#### D) Explainability Depth
- Keep explanations light and safe (no long LLM-generated essays).

---

### 16.4.2 Next Steps (Prioritized Backlog)
Focus on changes that would materially improve matching:

1. Add embeddings / vector retrieval (catalog embeddings)
2. Improve candidate generation with hybrid search (BM25 + structured filters)
3. Better image preprocessing (background removal, crop detection)
4. Better user prompt parsing and constraint handling (price/dimensions)
5. Persist admin config and evaluation feedback (DB)
6. Add auth (real admin protection)
7. Add rate limiting + caching (per image hash)
8. Add a real observability stack (OpenTelemetry exporter)

Each item should include:
- why it matters
- expected impact (quality/latency/cost)
- complexity estimate (low/medium/high)

---

## 16.5 CHANGELOG: format, entries, and relevant prompts

### 16.5.1 Purpose of the CHANGELOG
The CHANGELOG should demonstrate:
- coherent iteration
- rationale behind key changes
- how retrieval and ranking evolved
- what prompts were used to guide the coding agent
- what tradeoffs were introduced/removed

This is not just “v1/v2 bug fixes”.
It’s a narrative of engineering decisions.

---

### 16.5.2 Recommended Format
Use a consistent template per entry:

- **Date / Version**
- **Summary**
- **Changes**
- **Reason / Motivation**
- **Impact**
- **Prompt(s) given to coding agent** (short, focused)
- **Notes / Follow-ups**

Example (structure):
- `## [0.3.0] - 2026-02-11`
  - Added admin-configurable ranking weights
  - Motivation: allow reviewers to inspect retrieval/ranking sensitivity
  - Prompt: “Implement in-memory config store + admin endpoint...”
  - Impact: ranking now adjustable without redeploy

---

### 16.5.3 What to Emphasize (Per the Task)
Put extra detail on:
- how candidate generation was implemented and improved
- how scoring weights were introduced and tuned
- how reranking was added (or decided against)
- how you handled weak/ambiguous images
- schema validation for AI outputs
- observability: tokens/latency/error tracking

---

### 16.5.4 Prompt Logging Guidelines (Compliant + Useful)
You should include:
- prompts you gave your coding agent that materially affected design
- constraints you stated (“don’t persist API keys”, “read-only Mongo”)
- what you asked the agent to implement

Avoid:
- dumping extremely long prompt transcripts
- including secrets
- including user-supplied keys or tokens

Best practice:
- include **short prompts** plus a link to the commit
- or include a summarized version:
  - “Prompt (summary): implement reranking with structured JSON schema and retry on parse failure.”

---

### 16.5.5 Example Changelog Entries (Suggested Milestones)
Your CHANGELOG could include entries like:

1) **Scaffold**
- monorepo setup, base routes, basic UI

2) **Image upload + validation**
- limits, mime types, errors

3) **Vision extraction**
- schema-based JSON extraction from image

4) **Candidate generation**
- Mongo filters, projections, fallback strategies

5) **Scoring + ranking**
- weighted scoring, normalization

6) **Admin controls**
- tuning knobs, config snapshots

7) **Evaluation hooks**
- golden set runner or in-app feedback logging

8) **Hardening**
- retries, timeouts, better error messages, correlation IDs

This tells a reviewer you iterated in a high-signal way.

---

## Expected Outcome
If `README.md` and `CHANGELOG.md` follow this plan, a reviewer can:
- run the app quickly (Docker or pnpm)
- understand the retrieval + ranking design without reading the entire codebase
- see evidence of quality evaluation thinking
- trace engineering decisions and tradeoffs across development
- confidently discuss the system in a live demo and follow-up conversation