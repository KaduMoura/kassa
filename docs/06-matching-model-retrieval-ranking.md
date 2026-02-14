# 06 — Matching Model (Retrieval & Ranking)

This document defines the **matching model** used to retrieve and rank products from the MongoDB catalog based on:
- an uploaded **image** (primary signal),
- an optional **user prompt** (refinement signal),
- and the catalog’s **structured metadata** (category/type/price/dimensions).

The matching system is built as a **two-stage pipeline**:

1. **Stage 1 — Signal Extraction (Gemini 2.5 Flash)**  
   Extracts structured signals from the image (and optionally the prompt) into a schema-validated JSON object.

2. **Stage 2 — Catalog-Aware Re-ranking (Gemini 3 Flash Preview)**  
   Ranks a bounded set of catalog candidates using signals + prompt context.

A **deterministic heuristic ranker** exists as a fallback and baseline.  
Admin parameters control the most important knobs (candidateTopN, weights, thresholds, rerankTopM, etc.).

---

## 06.1 “Signals” Strategy (Image, Text, Metadata)

### Goal of the Signals Layer
Transform ambiguous raw inputs into a **structured representation** that:
- can drive an efficient catalog retrieval query,
- can be used for deterministic scoring,
- and can be sent to the reranker in compact form.

Signals are grouped into:

1) **Visual signals** (from image)  
2) **Intent signals** (from user prompt)  
3) **Catalog compatibility signals** (from product metadata)

---

### 06.1.1 Visual Signals (Image → structured attributes)
Extracted via **Gemini 2.5 Flash**.

**Core visual signal categories**
- **Object identity**
  - `category_guess` (e.g., "chair", "sofa", "table")
  - `type_guess` (e.g., "armchair", "dining chair", "coffee table")
  - confidence per field
- **Style**
  - e.g., Scandinavian, modern, industrial, classic, mid-century
- **Material**
  - wood, metal, leather, fabric, glass
- **Color / finish**
  - dominant colors; e.g., "light wood", "black", "gray"
- **Shape / structure**
  - round vs rectangular
  - legs count, armrests, chaise presence, backrest height
- **Functional cues**
  - recliner, storage, extendable, stackable (if discernible)

**Quality flags**
- `isFurnitureLikely` (boolean + confidence)
- `multipleObjects` (boolean)
- `occludedOrPartial` (boolean)
- `lowImageQuality` (boolean)
- `dominantItemDescription` (short string)

**Output design rule**
- Signals must be **schema-validated** and include **confidence scores**.  
  Confidence drives whether we apply strict filters or soft bias.

---

### 06.1.2 Intent Signals (Prompt → constraints & preferences)
The prompt is treated as **preference and constraint language**, not a full override.

**Intent categories**
- **Disambiguation**: “coffee table”, “armchair”
- **Preferences**: “Scandinavian”, “light wood”
- **Constraints**: “under $400”, “max 120cm width”
- **Negative constraints**: “no leather”, “not black”
- **Use-case hints**: “small apartment”, “kids room” (soft bias)

**Normalization of prompt signals**
- Extract structured values when possible:
  - price range
  - dimensions range
  - must-have type/category tokens
- Otherwise keep as keywords:
  - style/material/color keywords

---

### 06.1.3 Catalog Compatibility Signals (Metadata-aware)
Since the catalog offers structured numeric fields, we can compute compatibility:

- **Type/category match score**
- **Dimensions proximity score**
- **Price proximity score**
- **Text similarity score** (keywords vs title/description)

The matching model should treat these as **features** for heuristic scoring and as useful context for Stage 2 reranking.

---

### 06.1.4 Unified Signal Object (Canonical Representation)
The application should standardize extracted signals into a canonical structure:

```json
{
  "vision": {
    "categoryGuess": { "value": "chair", "confidence": 0.78 },
    "typeGuess": { "value": "dining chair", "confidence": 0.61 },
    "attributes": {
      "style": ["scandinavian"],
      "material": ["wood"],
      "color": ["light wood"],
      "shape": ["straight legs", "minimalist backrest"]
    },
    "keywords": ["wood chair", "dining chair", "scandinavian chair"],
    "qualityFlags": {
      "isFurnitureLikely": true,
      "multipleObjects": false,
      "lowConfidence": false
    }
  },
  "intent": {
    "rawPrompt": "light wood, under $200",
    "constraints": {
      "priceMax": 200
    },
    "preferences": {
      "style": ["scandinavian"],
      "material": ["wood"],
      "color": ["light wood"]
    },
    "negatives": []
  }
}
````

This object is the input to retrieval, heuristic ranking, and reranking.

---

## 06.2 Candidate Generation (Initial Catalog Retrieval)

### Objective

Return a plausible candidate set with **high recall** (don’t miss good items), while remaining efficient and bounded.
Candidate generation is not expected to be perfect—it’s an upstream stage optimized for recall, not precision.

---

### 06.2.1 Candidate Set Sizes

* `candidateTopN` (Admin-controlled): recommended default 50–100
* Always enforce a **hard cap** (e.g., 200) to prevent runaway queries and payload sizes.

---

### 06.2.2 Retrieval Plans (Confidence-driven)

Candidate retrieval should select a plan based on vision confidence:

#### Plan A — Confident category/type (high precision bias)

**When**

* `categoryGuess.confidence >= thresholdCategory`
* `typeGuess.confidence >= thresholdType` (optional)

**How**

* Apply soft or hard filtering:

  * `category = "chair"`
  * `type IN ["dining chair", "side chair"]` (if aligned with catalog values)
* Add keyword search in `title/description` using extracted keywords
* Limit results to `candidateTopN`

#### Plan B — Confident category, uncertain type (balanced)

**When**

* category confidence high, type uncertain

**How**

* Filter by category only
* Use stronger keyword match
* Retrieve more candidates (slightly higher N if needed)

#### Plan C — Low confidence / ambiguous (recall-first)

**When**

* low confidence OR multiple objects OR low-quality flags

**How**

* Avoid strict filters
* Use broad keyword search derived from any available cues
* If prompt exists, use prompt keywords as primary
* Consider retrieving the maximum allowed `candidateTopN` for recall

---

### 06.2.3 Query Construction Rules

To avoid empty results and poor performance:

* Prefer bounded retrieval with strict projection
* Avoid unindexed regex scans unless absolutely necessary
* If a text index exists, use `$text`; otherwise use `$or` with safe constraints
* Always implement **relaxation logic**:

  * if strict query returns < `minCandidates`, automatically broaden

**Relaxation Ladder (example)**

1. category + type + keywords
2. category + keywords
3. keywords only
4. prompt keywords only
5. show empty state with guidance (rare)

---

### 06.2.4 Candidate Projection (Minimize Payload)

Candidates returned from Mongo should include only required fields:

* `_id`
* `title`
* `description` (truncated later)
* `category`
* `type`
* `price`
* `width`, `height`, `depth`

This reduces memory usage and speeds up processing.

---

## 06.3 Re-ranking (Final Ordering)

### Objective

Convert a recall-optimized candidate list into a precision-optimized top-K ranked list.

Re-ranking has two layers:

1. **Heuristic pre-ranking** (deterministic)
2. **LLM reranking** (Gemini 3 Flash Preview), if enabled

---

### 06.3.1 Heuristic Pre-Ranking (Deterministic Baseline)

Before calling Gemini 3, compute a composite score per candidate. This provides:

* stability
* a fallback ranking if Gemini 3 fails
* a way to trim candidate list for reranking (`TopM`)

**Feature signals used**

* Text similarity score (keywords vs title/description)
* Category/type match score
* Style/material/color keyword matches
* Price compatibility (if prompt expresses)
* Dimension compatibility (if prompt expresses)

**Composite scoring**
`score = Σ(weight_i * feature_i)`

Weights are Admin-configurable.

**Banding**

* HIGH / MEDIUM / LOW match bands based on score thresholds (configurable).

---

### 06.3.2 LLM Re-ranking (Gemini 3 Flash Preview)

Gemini 3 reranking is used for nuanced comparisons among similar candidates, especially when:

* catalog descriptions are subtle,
* multiple items share similar keywords,
* heuristics cannot properly infer style/material.

**Input**

* Canonical signals (vision + intent)
* TopM candidates from heuristic pre-ranking:

  * `llmRerankTopM` default: 20–40
* Candidate data must be compact:

  * truncated description
  * normalized fields (see §05.5)
  * stable candidate identifiers

**Output**

* ordered list of candidate ids
* optionally:

  * short reasons (restricted vocabulary)
  * confidence estimate

**Validation rules**

* Output must reference only ids provided.
* Output must include at least K results if possible.
* If output invalid → fallback to heuristic ranking.

**Determinism**

* Use low temperature.
* Fix system prompt and output schema.
* Enforce strict JSON output and validate with Zod.

---

### 06.3.3 Hybrid Ranking Policy

Final ranking policy:

1. If Gemini 3 rerank succeeds:

   * adopt Gemini ordering
   * optionally combine with heuristic score for tie-breakers
2. If rerank fails:

   * use heuristic ordering

This preserves robustness and predictable system behavior.

---

## 06.4 Fusion with User Prompt (Query Refinement)

### Prompt Fusion Principles

* The image is the **primary intent**.
* The prompt is a **refinement** and should bias retrieval and ranking.
* The prompt may override intent only if:

  * image confidence is low, OR
  * user explicitly indicates mismatch (“not this item, I want a dining table”).

---

### Prompt → Retrieval Fusion

* Add prompt keywords to the retrieval query:

  * e.g., “scandinavian”, “light wood”, “black metal”
* Convert constraints:

  * `under $300` → post-filter or ranking penalty for higher prices
  * `smaller` → dimension preference scoring

**Important rule**
Avoid hard filtering too early. Prefer:

* broad retrieval
* constraint application during ranking

This prevents empty result sets.

---

### Prompt → Ranking Fusion

Prompt signals affect:

* Weighting (increase weights for the mentioned dimensions/price)
* Penalties:

  * “no leather” adds penalty if description contains leather
* Soft constraints:

  * prefer items closer to desired size/price, but don’t eliminate all others

---

### Conflict Handling

If prompt conflicts strongly with image:

* attempt primary image-based pipeline
* if low quality results, attempt prompt-driven retrieval as fallback
* show a subtle notice: “Results are based on the uploaded photo; prompt was applied as a preference.”

---

## 06.5 Normalization & Catalog Features (title/desc/type/category/dimensions/price)

### Why Normalization Matters

Catalog data can be inconsistent:

* casing differences
* synonyms (“sofa” vs “couch”)
* missing or noisy descriptions
* numeric fields in different ranges

Normalization ensures stable matching and reduces LLM confusion.

---

### Text Normalization

For retrieval and heuristic scoring:

* lowercase
* trim whitespace
* remove repeated punctuation
* optional: normalize accents (if needed)

**Tokenization**

* create keyword tokens for title and description
* remove stopwords optionally (careful; can remove meaningful style words)

---

### Controlled Vocabulary (Optional)

If catalog values are inconsistent, maintain a small mapping:

* category synonyms
* type synonyms
* “sofa” ↔ “couch” (only if present in data)

Keep this minimal to avoid over-engineering.

---

### Numeric Normalization

#### Dimensions (cm)

* Ensure width/height/depth are treated as numbers
* If missing/zero, treat as unknown and reduce dimension impact on score

#### Price ($)

* Ensure numeric and > 0
* If missing, treat as unknown and avoid filtering

---

### Feature Extraction for Heuristic Ranking

Compute per candidate:

* `f_text`: similarity between combined keywords and title/desc
* `f_type`: match between guessed type and candidate type
* `f_category`: match between guessed category and candidate category
* `f_style/material/color`: keyword hits in title/desc
* `f_price`: penalty if outside user range
* `f_dims`: penalty if far from desired size

Keep these feature calculations deterministic and unit-testable.

---

## 06.6 Heuristics & Fallbacks When the Image Is Weak

### Weak Image Conditions

* low confidence signals
* multiple objects
* heavy occlusion
* blurry / low light
* not-furniture likely

These conditions should be produced by Stage 1 quality flags.

---

### Fallback Strategy Ladder

1. **Low-confidence retrieval plan**

   * avoid strict category/type filters
   * rely on broad keywords + prompt
2. **Heuristic-only ranking**

   * skip Gemini 3 rerank if:

     * token overflow risk
     * timeouts
     * provider errors
3. **Prompt-only search fallback**

   * if image is unrecognizable but prompt exists
4. **Empty state + guidance**

   * if both image and prompt provide insufficient signal

---

### Heuristic Guardrails

* Always return the best-effort list when possible.
* If results are likely off-topic:

  * show notice and suggest user actions:

    * closer photo
    * add prompt
    * reduce constraints

---

### Confidence-aware UI Messaging (via notices)

Examples:

* `LOW_CONFIDENCE_IMAGE`: “We couldn’t confidently identify the item; showing best-effort matches.”
* `RERANK_DISABLED`: “Using fast ranking mode.”

These messages must not expose internal provider names unless in Admin.

---

## 06.7 Explainability (Lightweight “Why This Was Suggested”)

Explainability should increase trust without exposing internals or adding complexity.

### Goals

* Give users confidence that results are not random
* Provide “actionable understanding” (what to change to improve results)
* Avoid long, model-generated essays

---

### Explainability Format (Recommended)

For each item, provide 1–3 short “match reasons” chosen from a controlled set:

**Reason vocabulary examples**

* “Type match”
* “Category match”
* “Style match”
* “Material match”
* “Color match”
* “Size preference match”
* “Price preference match”
* “Keyword match”

**Rules**

* Reasons must be derived from deterministic signals where possible.
* If Gemini 3 outputs reasons, they must be:

  * validated
  * truncated
  * mapped into the controlled vocabulary

---

### Global Search Notice (Optional)

At the top of results, show one concise summary:

* “Matched based on: dining chair + light wood + Scandinavian style.”

This should be built from structured signals, not raw LLM prose.

---

### Admin Debug Explainability (Optional)

Admin may show:

* extracted signals JSON
* candidate retrieval plan selected
* fallback reasons
* timings and counts

End user should not see these details by default.

---

## Expected Outcome

Implementing this matching model provides:

* High recall candidate generation from a read-only MongoDB catalog
* Strong relevance ranking through heuristic scoring + Gemini rerank
* Prompt refinement that improves results without breaking intent
* Deterministic fallback behavior for reliability
* Lightweight explainability to improve user trust and demo quality
* Clean tuning knobs via Admin for fast iteration during evaluation