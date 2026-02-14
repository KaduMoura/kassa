# 17 — Delivery & Live Demo Plan

This section describes how the project should be packaged for submission, how to run a reliable live demo, and how to defend the implementation choices under interview-style scrutiny. The intent is to minimize demo risk, maximize clarity, and show strong engineering judgment (KISS/DRY/separation of concerns) while keeping the focus on retrieval + ranking quality.

---

## 17.1 Delivery checklist (repo, docs, execution)

### 17.1.1 Repository readiness
Before submitting, verify the repository is “reviewer-friendly”:

- **Single canonical branch** (e.g., `main`) with a clean, linear history (or well-scoped merges)
- **No secrets committed**
  - No `.env` files (only `.env.example`)
  - No API keys, tokens, credentials, or personal data
- **Deterministic installs**
  - Lockfile committed (`pnpm-lock.yaml` / `package-lock.json`)
  - `engines.node` set in package manifests if possible
- **Consistent formatting**
  - Prettier + ESLint configured and passing
- **Working from a fresh clone**
  - Run `git clone` into an empty folder and follow the README “fast path”
  - Ensure it works without manual tweaks

---

### 17.1.2 Documentation completeness
Confirm documentation meets the test requirements and reads well:

- `README.md` includes:
  - **How to run locally** (Docker and/or pnpm)
  - URLs and default ports
  - Overview of matching approach (candidate generation + scoring + rerank, if used)
  - Admin usage instructions (what knobs do, how to test them)
  - Evaluation approach (golden set + metrics and/or in-app feedback)
  - Future improvements list
- `CHANGELOG.md` includes:
  - Key milestones with **reasons/motivations**
  - Focus on search quality and implementation evolution
  - Relevant prompts given to coding agents (sanitized)

---

### 17.1.3 Execution and reliability
Make sure the system behaves well under typical reviewer actions:

- **Startup success**
  - Docker: `docker compose up --build` works on a clean environment
  - Non-Docker: `pnpm install && pnpm dev` works without additional setup
- **Runtime safety**
  - API key is accepted at runtime and stored **in memory only**
  - Key is not printed in logs or returned in responses
- **Error handling**
  - Invalid/expired AI key → friendly message + clear next step
  - AI provider timeout → retry or fallback path + user feedback
  - Unrecognizable image → graceful “no confident matches” UI state
- **Performance**
  - First result returned in a reasonable time (and the UI shows progress)
  - “Cancel / retry” behavior is sane (at least retry)
- **Admin isolation**
  - Admin settings don’t break the system when set to extremes (clamp ranges)
  - Reset-to-default available (one click)

---

### 17.1.4 Submission artifacts (optional but high-signal)
If allowed / helpful:

- A short **demo GIF** or **1–2 minute screen recording** showing:
  - upload → results → admin tuning → results change
- A small `docs/` folder with:
  - architecture diagram
  - evaluation notes
  - sample demo inputs (if licensing permits)

---

## 17.2 Live demo runbook (scenarios)

### 17.2.1 Demo goals
In a live demo you want to prove:
1. The product works end-to-end reliably
2. The matching quality is thoughtful and tunable
3. You can explain retrieval/ranking tradeoffs clearly
4. The system is built with clean abstractions and safe handling

---

### 17.2.2 Demo setup (before the call)
**15 minutes before:**
- Start the app fresh (Docker or pnpm)
- Open:
  - user UI tab
  - admin tab
  - backend logs (terminal)
- Have 5–8 test images ready in a folder:
  - chair, sofa, dining table, bed, cabinet
  - 1 cluttered background image
  - 1 low-quality or partial view image
- Have 3–5 example prompts ready:
  - “mid-century modern, walnut”
  - “minimalist, white, Scandinavian”
  - “small space, narrow width”
  - “under $300”
- Confirm AI key works and is not persisted anywhere

---

### 17.2.3 Recommended live demo flow (10–15 minutes)

#### Scenario A — Baseline: image-only search
1. Upload a clear furniture image (e.g., a chair)
2. Show:
   - top results
   - “why matched” explanation snippets (type/style/material cues)
   - any confidence indicator (if present)
3. Explain pipeline at a high level:
   - vision extraction → candidate generation → scoring → final ranking

**What you’re demonstrating:** baseline quality and explainability.

---

#### Scenario B — Add prompt refinement
1. Use the same image
2. Add prompt: “walnut, mid-century modern”
3. Re-run and compare:
   - how the top 5 changes
   - what features shifted (style/material keywords, category bias)

**What you’re demonstrating:** prompt fusion impacts ranking (not just text search).

---

#### Scenario C — Admin tuning changes ranking behavior
1. Open Admin and show the knobs:
   - candidate set size
   - weights: image/type/category vs text similarity vs price/dims
   - rerank toggle (if applicable)
2. Make a small change (e.g., increase style weight)
3. Re-run the same input and show the difference

**What you’re demonstrating:** configuration surface exists and is meaningful.

---

#### Scenario D — Edge case: ambiguous or cluttered image
1. Upload a cluttered background image (or partial item)
2. Show how the system responds:
   - lower confidence
   - broader candidates
   - fallback messaging

**What you’re demonstrating:** graceful handling without derailing.

---

#### Scenario E — Failure mode: AI provider error (optional)
If time allows, simulate an invalid key:
1. Paste an invalid key
2. Run search
3. Show:
   - clear error messaging
   - no crash
   - user action to recover (replace key, retry)

**What you’re demonstrating:** operational resilience and UX maturity.

---

### 17.2.4 Narration tips during demo
- Don’t read code on screen unless asked.
- Explain “why this was built this way” in terms of constraints:
  - read-only DB, existing indexes, KISS requirement, time-boxed assessment
- Emphasize “candidate generation is the cost lever” and “reranking is optional”.

---

## 17.3 Expected questions and how to defend tradeoffs

### 17.3.1 Retrieval and ranking quality
**Q: Why does this result rank above that one?**  
Answer by referencing:
- feature-level scoring (category/type match, text similarity, numeric proximity)
- weighted sum or calibrated scoring
- optional reranker stage and its role

**Q: How do you avoid hallucinations from the vision model?**  
- Use structured schema output for extraction
- Validate, clamp, and fallback on parse errors
- Never let LLM directly “invent” catalog items—only ranks retrieved candidates

**Q: Why not embeddings / vector search?**  
- KISS + time constraints + “no DB modifications”
- Baseline can be strong with hybrid signals + good candidate generation
- Vector search is a clear next step once allowed (offline embedding pipeline)

---

### 17.3.2 Database and performance constraints
**Q: How do you query Mongo effectively without changing indexes?**  
- Use existing fields (title/description/category/type) and conservative filters
- Keep projections minimal
- Limit candidate set size and paginate
- Cache extracted signals per request (in memory) if needed

**Q: What are the performance bottlenecks?**  
- AI calls dominate latency
- Candidate generation and scoring should be fast and deterministic
- Optional rerank only runs on top-N (bounded)

---

### 17.3.3 Security and API key handling
**Q: Where is the user’s API key stored?**  
- In-memory only (client session or server memory)
- Never persisted
- Not logged
- Cleared on refresh / session end

**Q: What about image privacy?**  
- Uploaded image is processed transiently
- Not stored by your app beyond request lifecycle (unless explicitly designed)
- Logging excludes binary data

---

### 17.3.4 Admin and evaluation
**Q: Why have an admin panel at all?**  
- Requirement + demonstrates tuning the matching algorithm
- Makes scoring strategy transparent
- Facilitates quick iteration and A/B-like comparisons

**Q: How do you know it’s “good”?**  
- Golden set + metrics (Top-K, MRR)
- In-app thumbs up/down for lightweight feedback
- Capture config snapshot per run to correlate changes with quality

---

### 17.3.5 Engineering quality
**Q: How is the code structured to avoid over-engineering?**  
- Clear boundaries:
  - UI components
  - API layer
  - matching pipeline service
  - provider abstraction
  - config store
- Minimal abstractions that pay off:
  - provider interface
  - scoring feature computation
  - candidate query builder

---

## 17.4 Post-test backlog (recommended enhancements)

Below is a prioritized list of improvements you can discuss after the assessment. Each item includes **impact** and **why it’s next**.

### 17.4.1 Highest impact on match quality
1. **Hybrid retrieval with embeddings**
   - Build embeddings for catalog titles/descriptions + optional image embeddings
   - Combine with keyword/type filtering
   - **Impact:** major relevance improvement for style/material nuance

2. **Better candidate generation strategy**
   - Smarter fallback when vision is uncertain
   - Category/type inference improvements
   - **Impact:** prevents “no good matches” and reduces false positives

3. **Learning-to-rank / calibration**
   - Use feedback data (thumbs up/down) to tune weights
   - Possibly train a lightweight ranker offline
   - **Impact:** continuous improvement loop

---

### 17.4.2 UX and explainability enhancements
4. **Richer “why matched” explanations**
   - Highlight matched attributes (type, color, material, style)
   - Show which user prompt constraints were applied
   - **Impact:** higher trust and easier debugging

5. **Interactive refinement**
   - Quick filters: “similar style”, “lower price”, “smaller size”
   - **Impact:** reduces need to rewrite prompts

---

### 17.4.3 Reliability and operations
6. **Caching and deduplication**
   - Cache vision extraction results by image hash
   - Cache candidate results by extracted features + admin config
   - **Impact:** faster repeated searches, lower cost

7. **Observability upgrades**
   - OpenTelemetry traces, structured logs, dashboards
   - AI metrics: token usage, provider latency, failure rates
   - **Impact:** production readiness

8. **Robust admin/auth**
   - Real auth, role-based access
   - Persist config per environment
   - **Impact:** safe internal operations

---

### 17.4.4 CI/CD and dev workflow improvements
9. **E2E tests for critical flows**
   - Upload → results → admin adjust → re-run
   - **Impact:** reduces regression risk

10. **Release automation**
   - Semver tags, changelog automation, Docker image publishing
   - **Impact:** faster iteration and deployment

---

## Outcome
With this delivery and demo plan, you can:
- submit a repo that runs quickly and reliably
- showcase retrieval/ranking quality and tunability clearly
- handle typical reviewer questions confidently
- present a credible roadmap that shows strong product + engineering intuition