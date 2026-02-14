# 03 — Business Rules & User Experience (UX)

This document defines the **business rules** and **user experience behaviors** for the Image-Based Product Search application.  
It focuses on the end-user and admin-facing behaviors that determine **how search is performed**, **how results are presented**, and **how the system communicates** across normal and edge-case flows.

> Scope of this doc:
> - User journey: upload → AI analysis → catalog search → ranking → results
> - Optional prompt semantics (how text changes retrieval/ranking)
> - UX for ranked results (what is shown, how it’s explained)
> - System states: loading / empty / error / fallback modes
> - Messaging conventions: consistent tone and actionable feedback

---

## 03.1 Journey: Upload → Analysis → Results

### Primary User Goal
The user wants to upload a photo of a furniture item and quickly get **relevant catalog matches**, optionally refining via a short query.

### Main Screens / Areas
- **Search (User) tab/page**
  - Image upload input + preview
  - Optional prompt field
  - “Search” CTA
  - Results list (ranked)
- **Admin tab/page**
  - Retrieval/ranking parameters
  - Eval mode (optional)
  - Diagnostic info (optional)

This section describes the **Search (User)** journey.

---

### Step 0 — Initial State (Before Upload)
**Rules**
- No search may be triggered without an image.
- The “Search” button is disabled until an image is selected and passes basic validation.

**UI requirements**
- Clear call-to-action: “Upload a photo of the furniture item”
- Optional helper text: “Use a well-lit photo focused on one item.”

---

### Step 1 — Image Selection & Validation
**Accepted formats**
- JPEG, PNG, WebP (configurable)
- Reject HEIC unless explicitly supported

**Validation rules**
- Maximum file size (example default): 5–10 MB (configurable in Admin)
- Minimum image dimensions (optional): e.g., at least 256px on shortest side
- If invalid:
  - Do not proceed to analysis or upload
  - Show a clear inline validation error (see §02.5)

**UI behavior**
- Immediately show a preview
- Show filename and size
- Allow user to remove/replace the image

**Business rule**
- Image must be treated as ephemeral input:
  - Do not persist image long-term
  - Do not use it for training
  - Use only for that request (or optional ephemeral caching during the session)

---

### Step 2 — (Optional) Prompt Input
The prompt is a short natural language refinement describing user intent.

**Rules**
- Prompt is optional.
- Prompt length should be bounded:
  - Soft limit for UX (e.g., 200 chars)
  - Hard limit for safety/cost (e.g., 500 chars)
- Empty prompt should be treated as “no constraints”.

**UI behavior**
- Prompt box should include example placeholder:
  - “e.g., Scandinavian style, light wood, under $300”
- Provide quick suggestions (optional):
  - “smaller size”, “modern”, “black”, “wood”

---

### Step 3 — Search Trigger
When the user clicks **Search**:

**Business rules**
- A single “search session” begins.
- The system creates a correlation id (`searchId`) for logs and debugging.
- Inputs are frozen for that run (image + prompt + current admin parameters).

**UX behavior**
- Disable the Search button to prevent duplicate submissions.
- Provide visible loading feedback immediately.

---

### Step 4 — Analysis & Retrieval Pipeline (User-visible model)
Even though there are multiple backend stages, the user should experience it as one coherent process:

**User-perceived phases**
1. “Analyzing image”
2. “Searching catalog”
3. “Ranking results”

**Rules**
- If the system detects:
  - not-furniture image,
  - multiple objects,
  - low confidence,
  it must still attempt a meaningful fallback search (unless impossible).

**UX requirement**
- The user should never see raw technical details (stack traces, provider errors).
- Provide a meaningful “next action” suggestion if results are poor.

---

### Step 5 — Results Display
Results appear as a ranked list with clear supporting information.

**Rules**
- Show a “Best match” emphasis on the top result.
- Provide top-K list (default e.g., 10), configurable via Admin.
- Provide stable ordering: repeated runs with same inputs should not wildly shuffle.

---

## 03.2 Optional Prompt and How It Changes Search

The optional prompt is a **refinement signal** that can alter both candidate generation and ranking.  
It should never fully override the image unless the prompt explicitly requests a different intent.

### Prompt intent categories (interpreted by system)
The prompt may express:

1. **Attribute preferences**  
   - Color: “gray”, “white”
   - Style: “Scandinavian”, “minimalist”
   - Material: “oak”, “leather”
2. **Constraints**
   - Size: “smaller”, “under 120cm wide”
   - Price: “under $400”
3. **Type disambiguation**
   - “coffee table” vs “dining table”
   - “armchair” vs “chair”
4. **Negative constraints**
   - “no leather”, “not a recliner”
5. **Use-case hints**
   - “for a small apartment”
   - “for kids room”

---

### Business rules: how prompt affects retrieval

#### Rule 1 — Prompt can narrow the candidate pool (softly)
- If prompt contains strong disambiguation (e.g., “coffee table”):
  - the system may prioritize that `type` during candidate generation
- But it should remain a **soft preference** unless confidence is high.

#### Rule 2 — Prompt can apply post-filters (optional)
- Price constraint could filter after retrieval to avoid empty search results from overly strict queries.
- Size constraint should typically be applied at ranking time (soft penalty), not hard filter.

#### Rule 3 — Prompt should influence ranking weights
- If user mentions price → increase weight of price compatibility
- If user mentions size → increase weight of dimension compatibility
- If user mentions color/material/style → increase weight of text/attribute similarity

These weights are **configurable via Admin**.

---

### Business rules: prompt conflict resolution

#### Conflict: prompt contradicts image
Example: image looks like a **sofa**, prompt says “dining table”.

Behavior:
- Use the prompt as a disambiguation signal but do not immediately override.
- System should attempt:
  1. Image-driven candidates (primary)
  2. Prompt-driven broad fallback (secondary) if primary results are poor

**UX guidance**
- In this case, show a small notice:
  - “Results are based on the uploaded image. If you meant a dining table, try a clearer photo or update your prompt.”

#### Conflict: multiple constraints are too strict
Example: “leather sofa under $50”.

Behavior:
- Prefer returning “closest matches” rather than empty.
- Inform user: constraint may be too restrictive.

---

## 03.3 Ranking and Presentation of Matches (UX)

### What “good ranking” means (user perception)
- The top results should look visually and semantically similar to the photo.
- The list should feel “reasonable”, not random.
- Users should be able to quickly scan key info.

---

### Result Card Content (Minimum)
Each result card should display:

- **Title** (primary)
- **Category** and **Type** (secondary)
- **Price** (if present)
- **Dimensions** (W × H × D in cm)
- Optional: short snippet from description (truncated)

---

### Ranking indicators (UX cues)
To help users trust the ranking:

- Label the top result:
  - “Best match”
- Optionally show confidence band:
  - “High / Medium / Low match” (derived from score thresholds)
- Optionally show “Matched on” tags:
  - “type: sofa”, “style: modern”, “material: wood”

> Important: keep explanation lightweight.
> Do not show full internal scoring.

---

### Sorting & Controls
**Rules**
- Default sorting is “Relevance”.
- Optionally allow switching to:
  - Price (low → high)
  - Price (high → low)
  - Size (small → large) — if meaningful

If extra sorts are offered, they should not break the meaning of “relevance”.  
Example: show them as secondary “Sort by” options.

---

### Pagination vs Top-K
Because evaluation focuses on match quality, it’s better to prioritize:
- Showing **Top K** best matches (10–20)
- Avoid heavy pagination complexity unless trivial

---

### Handling duplicates / near-duplicates
If multiple catalog items are essentially duplicates:
- The system may keep them (catalog is read-only)
- But optionally cluster them or show “Similar variants” (future enhancement)
For this test: keep it simple, do not over-engineer clustering.

---

## 03.4 System States (Loading, Empty, Error, Fallback)

The system must behave predictably and gracefully.

### Loading States
#### Loading triggers
- After clicking Search
- While waiting for backend / AI

#### Loading UX rules
- Show a clear progress indicator.
- Disable inputs that would break state (e.g., Search button).
- Allow user to cancel/reset (optional but nice).

#### Suggested user-facing phases
- “Analyzing image…”
- “Searching catalog…”
- “Ranking results…”

---

### Empty States (No Results)
Empty state should be rare because of fallback logic, but must be supported.

**Possible causes**
- Image not furniture
- Very low confidence extraction
- No matching products in catalog

**Behavior**
- Show a helpful empty state, not a blank screen.
- Provide next actions:
  - “Try a clearer photo”
  - “Add a short description”
  - “Try removing constraints”

---

### Error States
Errors may occur due to:
- AI provider errors (timeout, 429)
- Network failures
- Mongo query failures
- Invalid AI output format (schema mismatch)

**Business rules**
- Never show raw error output.
- Provide a stable error format internally; user sees friendly message.
- If stage 2 (rerank) fails, do not fail the whole search:
  - return heuristic-ranked results.

---

### Fallback Modes (Core to UX quality)
Fallback is a first-class concept.

#### Fallback mode types
1. **Broad search fallback**
   - If vision extraction fails or is low confidence:
     - retrieve candidates using minimal assumptions (keywords only)
2. **Heuristic-only ranking**
   - If Gemini 3 rerank fails:
     - rank candidates using composite heuristic score
3. **Prompt-only fallback** (last resort)
   - If image is unrecognizable:
     - attempt text-only search based on prompt, but communicate clearly

**UX requirement**
- If fallback is used, show a subtle notice:
  - “We couldn’t confidently analyze the photo; showing best-effort matches.”

---

## 03.5 Messaging and User Feedback Conventions

Messaging must be:
- concise
- actionable
- consistent in tone
- never technical or blameful

### Tone and style
- Neutral, helpful, non-judgmental
- Prefer instructions over apologies
- Avoid exposing model/provider names unless in Admin/debug mode

---

### Standard message structure
When showing user-facing feedback:

1. **What happened** (simple)
2. **What the system did** (if relevant)
3. **What the user can do next** (actionable)

Example:
- “We couldn’t clearly identify the furniture in this photo. Try a closer shot focused on one item.”

---

### Validation messages (image/prompt)
#### File too large
- “Image is too large (max 10MB). Choose a smaller file.”

#### Unsupported format
- “Unsupported format. Upload JPG, PNG, or WebP.”

#### Prompt too long
- “Prompt is too long. Keep it under 500 characters.”

---

### Search progress messages
- “Analyzing image…”
- “Searching catalog…”
- “Ranking results…”

---

### Error messages (user-facing)
#### AI provider timeout
- “The analysis took too long. Try again or use a smaller image.”

#### Rate limit (429)
- “Too many requests. Try again in a moment.”

#### Internal error
- “Something went wrong. Try again.”

---

### Fallback notices
Fallback notices should be subtle and not alarming:

- “Showing best-effort matches.”
- “We used a simpler ranking method for this search.”

---

### Result quality feedback (optional but recommended)
Provide a lightweight mechanism so the user (or evaluator) can give feedback:

- Thumbs up/down on each result
- “Was this helpful?” on the list
- Optional notes field (admin/eval mode)

This supports the evaluation methodology described in README.

---

## Output of This Document
After implementing this spec, the application should deliver:

- A clear and fast user journey
- Predictable behavior under success and failure
- Transparent (but lightweight) ranking UX cues
- Strongly guided user actions when results are poor
- Admin-controlled tuning without code changes
