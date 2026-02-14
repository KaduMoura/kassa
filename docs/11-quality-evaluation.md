# 11 — Quality Evaluation (Offline + Lightweight In-App)

This document defines how the system’s **matching quality** is evaluated, aligned with the assessment’s explicit priority:
> **We will evaluate the quality and relevance of the matches, not just whether the system returns results.**

The evaluation strategy is deliberately:
- **practical** (works with limited time),
- **repeatable** (can be re-run during a live demo),
- **actionable** (helps you tune Admin parameters and improve ranking),
- **lightweight** (no heavy ML infrastructure required).

Evaluation is split into:
1) **Offline evaluation** (using a small “golden set” of test images)
2) **In-app lightweight evaluation** (thumbs, notes, exportable logs)

---

## 11.1 Definition of “Relevance” and Criteria

### 11.1.1 What “Relevance” Means for This Task
In this application, “relevance” is not purely semantic text similarity. It means:

A catalog product is **relevant** to an uploaded furniture image if it matches the user’s intent across:
- **Primary identity:** category and type (chair vs sofa, dining table vs coffee table)
- **Core visual characteristics:** style, material, color, shape/function
- **Constraints:** prompt-based requirements (price, size, “not leather”, etc.)

Because the catalog is the only ground truth, relevance is defined operationally as:
> “Would a user consider this a plausible match for the item in the image, given the optional prompt?”

---

### 11.1.2 Relevance Grading (Multi-level)
Instead of binary relevance (relevant / not relevant), use 3 levels:

- **2 — Strong Match**
  - correct category and type
  - visually and functionally consistent (e.g., dining chair ↔ dining chair)
  - prompt constraints satisfied (if present)

- **1 — Weak Match**
  - correct category but wrong type (chair ↔ armchair)
  - or correct type but wrong subcategory (coffee table ↔ side table)
  - or mismatches a soft preference (style/material) but still plausible

- **0 — Irrelevant**
  - wrong category (sofa returned for a table image)
  - or violates strong constraints (“under $200” but item is $900)
  - clearly not a plausible match

This grading supports better diagnostics and scoring (e.g., discounted relevance).

---

### 11.1.3 Criteria Dimensions (What to Judge)
When grading a result, evaluate the following attributes:

1) **Category correctness**
- Are we in the same family? (chair/sofa/table/bed)

2) **Type correctness**
- Within the same category, is the subtype right?
  - dining chair vs lounge chair vs office chair
  - coffee table vs dining table

3) **Style/material/color alignment**
- Do prominent features match? (wood vs metal, fabric vs leather)

4) **Shape/function**
- Armrests, chaise, round vs rectangular, storage, etc.

5) **Prompt satisfaction (if prompt exists)**
- Price constraints
- Size constraints
- Negative constraints (“not leather”)

---

### 11.1.4 Primary Success Criterion (Top-K Quality)
The evaluation should emphasize what matters most:
- **Top-5 / Top-10 quality**
- not the long tail of results

The system is successful if:
- Top results are mostly “Strong Match”
- Prompt improves results
- Failures degrade gracefully (not random noise)

---

## 11.2 Manual Test Set (“Golden Set”)

### 11.2.1 Why a Golden Set
A golden set provides:
- a stable set of test cases
- a way to compare changes in Admin tuning
- evidence in README that you measured outcomes

The golden set should be small but diverse.

---

### 11.2.2 Golden Set Composition (Recommended)
Aim for **10–25 images** total. Include variety across:

**By category**
- 3–5 chairs (dining chair, armchair, office chair)
- 3–5 sofas (sectional vs loveseat vs couch)
- 3–5 tables (coffee vs dining vs side table)
- optional: bed / dresser / shelving if catalog supports

**By difficulty**
- Easy: clear single-item photo
- Medium: angled view, some background noise
- Hard: partial occlusion, low light, multiple items

**By prompt coverage**
- Some tests without prompt (image-only)
- Some tests with prompt:
  - style: “Scandinavian”
  - material: “wood”
  - constraint: “under $300”
  - negative: “not leather”
  - size: “smaller, narrow”

---

### 11.2.3 How to Collect Golden Set Images (Practical)
You can use:
- your own photos
- a few public images
- screenshots (acceptable)
- simple stock photos

**Important**
- Do not include copyrighted datasets in the repo if you don’t have rights.
- If including images in the repo, keep it small and attribute where appropriate.
- Alternatively, store only **image URLs** or local-only images and describe them.

---

### 11.2.4 Golden Set Metadata Format
Represent the golden set as a simple JSON file in the repo, for example:

`/eval/golden-set.json`

Each entry includes:
- `id` (stable key)
- `label` (human description)
- `imagePath` or `imageUrl`
- `prompt` (optional)
- `expectedCategory` (optional)
- `notes`

Example:
```json
[
  {
    "id": "chair_wood_01",
    "label": "Light wood dining chair, Scandinavian",
    "imagePath": "eval/images/chair_wood_01.jpg",
    "prompt": "scandinavian, light wood",
    "expectedCategory": "chair",
    "notes": "Clear single-item photo"
  }
]
````

This supports reproducibility and discussion in README.

---

### 11.2.5 Ground Truth Definition (How to Evaluate Without Exact Product IDs)

Because you may not know the “true” matching product in the catalog, define expected outcomes as:

* expected **category/type**
* and a subjective “top-K should contain plausible items”

In other words, the golden set is:

* **behavioral** ground truth (does this look right?)
* not exact label matching (unless you can identify exact products)

---

## 11.3 Metrics and Scoring Method (Top-K, MRR, etc.)

### 11.3.1 Why Metrics Matter Here

Metrics are not the core deliverable, but they show:

* systematic thinking
* ability to iterate and tune
* understanding of ranking evaluation

Keep them lightweight but meaningful.

---

### 11.3.2 Top-K Metrics (Primary)

#### Hit@K (Binary)

For each test:

* Hit@K = 1 if at least one “Strong Match” (grade=2) appears in top K
* else 0

Compute for:

* K = 1, 3, 5, 10

This answers:

* “Does the system place a correct-like match in the top results?”

---

#### Precision@K (Graded)

Compute:

* Precision@K = (count of grade>=1 in top K) / K

Optionally compute **StrongPrecision@K**:

* grade==2 only

---

### 11.3.3 Rank-Sensitive Metrics

#### MRR (Mean Reciprocal Rank)

Define “relevant” as grade==2 (Strong Match).
For each test:

* find the rank position of the first grade==2
* score = 1 / rank
  If none, score = 0
  MRR is the average across tests.

This answers:

* “How early does the first strong match appear?”

---

#### nDCG@K (Optional, Graded Relevance)

If you want one more professional metric without too much complexity:

* Use grades 0/1/2 as gains
* Compute nDCG@K

But only implement if time permits—MRR + Hit@K often suffice.

---

### 11.3.4 Prompt Lift Metrics (Very Important for This Task)

Because prompt refinement is a core feature, measure improvement:

For a subset of golden tests, run two modes:

* **Image-only**
* **Image + prompt**

Compute delta:

* ΔMRR
* ΔHit@5
* ΔPrecision@10

This demonstrates that prompt integration is meaningful.

---

### 11.3.5 Evaluation Procedure (Repeatable)

Define a repeatable process:

1. Choose a golden test case
2. Run image-only search → capture ranked results
3. Run image+prompt search → capture ranked results
4. Grade top 10 results using relevance levels (2/1/0)
5. Store grades and notes

Repeat for all test cases (or subset if time constrained).

---

## 11.4 Lightweight In-App Mechanism (Thumbs, Notes, Logs)

### 11.4.1 Purpose of In-App Evaluation

The in-app mechanism supports:

* quick judgment during demos
* capturing feedback for later analysis
* showing “product thinking” beyond pure coding

It should remain lightweight and optional.

---

### 11.4.2 Minimal In-App Features

#### A) Result-level Feedback

For each result card:

* 👍 “Good match”
* 👎 “Bad match”
* optional: “Strong / Weak” selector (or infer strong=thumbs up)

#### B) Search-level Feedback

At the top of results:

* “Was this search successful?” (Yes/No)
* optional: notes field

#### C) Notes

Let user add a short note:

* “Returned coffee tables instead of dining tables”
* “Prompt helped a lot”
* “Image was blurry”

---

### 11.4.3 What to Log (Evaluation Record)

Create an evaluation record in memory:

* timestamp
* requestId
* image hash or filename (not raw image)
* prompt text (optional; can store prompt length instead)
* final top-K result ids
* flags:

  * usedVisionFallback
  * usedRerankFallback
* per-result feedback
* notes

Example shape:

```json
{
  "at": "2026-02-11T12:34:56Z",
  "requestId": "req_abc123",
  "imageRef": "chair_wood_01.jpg",
  "prompt": "scandinavian, light wood",
  "results": [
    { "id": "p1", "rank": 1, "feedback": "up" },
    { "id": "p2", "rank": 2, "feedback": "down" }
  ],
  "meta": {
    "visionFallback": false,
    "rerankFallback": false,
    "timings": { "totalMs": 8200, "stage1Ms": 2300, "mongoMs": 320, "stage2Ms": 4600 }
  },
  "notes": "Good top-3, prompt improved ranking"
}
```

---

### 11.4.4 Storage Strategy (Keep It Simple)

Use an in-memory ring buffer:

* keep last 50–200 evaluation entries
* optionally separate from general telemetry (Topic 09)

No database required.

---

### 11.4.5 Export Mechanism

Provide a single action:

* “Export evaluation JSON”

This allows you to:

* include summarized results in README
* rerun comparisons after tuning weights/thresholds
* share evidence during interviews

---

### 11.4.6 Optional “Eval Mode” Toggle (Admin)

Admin may expose an “Eval Mode”:

* shows extra debug info:

  * extracted signals JSON
  * chosen retrieval plan (A/B/C)
  * candidateTopN, llmRerankTopM values used
* adds “Save evaluation” button

This makes the evaluation repeatable and demonstrable.

---

## 11.5 How to Document in README (Reproducible)

The README evaluation section should be:

* concise
* concrete
* reproducible

### 11.5.1 Recommended README Structure

Include a section:

## Matching Quality Evaluation

With subsections:

1. **Definition of relevance**

* describe the 0/1/2 grading

2. **Golden set**

* how many images
* categories covered
* examples of prompts
* where golden-set metadata lives (`/eval/golden-set.json`)
* whether images are included or referenced

3. **Method**

* image-only vs image+prompt
* top-K grading
* how scores computed
* how to reproduce locally

4. **Results summary**

* table of metrics:

  * Hit@5
  * MRR
  * prompt lift

5. **Observed failure modes**

* examples:

  * category confusion (coffee vs dining tables)
  * style mismatch
  * low-confidence images
* what mitigations exist (fallback, broader retrieval)

6. **How Admin tuning affects results**

* highlight at least one example:

  * increasing candidateTopN improved recall
  * disabling rerank reduced quality but improved latency
  * raising category confidence threshold reduced false filters

---

### 11.5.2 Reproducibility Instructions (Minimum)

Provide a simple command or workflow:

* run app locally
* open Admin
* load a golden image
* run image-only search
* run image+prompt search
* optionally export evaluation JSON

If you implement a CLI script (optional):

* `pnpm eval` runs golden set automatically (with mocked provider or real provider)
  But not required; manual reproducibility is fine.

---

### 11.5.3 How to Present Results Without Over-Claiming

Be honest and specific:

* “On a 15-image golden set, Hit@5 improved from X to Y after enabling rerank.”
* “Prompt lift improved MRR by Z on the prompt subset.”

Do not claim statistical significance or large-scale benchmarks.

---

## Expected Outcome

After implementing this evaluation approach, you will have:

* A clear, practical definition of relevance aligned with the task
* A small, diverse golden set enabling repeatable comparison
* Simple but meaningful ranking metrics (Hit@K, MRR, Precision@K)
* A lightweight in-app evaluation capture workflow (thumbs + notes + export)
* A README section that demonstrates systematic iteration and measurable improvement