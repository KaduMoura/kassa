# Technical Assessment Response

This document outlines how each requirement of the technical assessment was addressed in the submitted solution.

---

## 1. AI Provider & API Key Management

### Requirement
> Choose any **frontier model provider** (e.g. OpenAI, Anthropic, Google, etc.). The application must accept the user's own API key at runtime — store it **in memory only** (client-side or server-side); do not persist it to disk.

### Solution
- **Provider Choice:** Google Gemini (via `@google/generative-ai`) was chosen for its strong multimodal capabilities (`gemini-2.5-flash` for vision) and speed/cost efficiency (`gemini-3-flash-preview` for reranking).
- **Runtime Injection:**
  - **Frontend:** The user enters their API key in the UI settings or prompt dialog. It is stored in the browser's `localStorage` (client-side only) or session state, never sent to a backend database.
  - **Transport:** The key is sent as a custom header `x-ai-api-key` with each search request.
  - **Backend Security:**
    - In `apps/api/src/server.ts`, the logger is configured to explicitly **redact** the `x-ai-api-key` header to ensure it never appears in server logs.
    - The key is passed through the request context to the services (`ImageSearchService`) and used strictly for the duration of the request, ensuring no disk persistence.

---

## 2. Core Features: Image Upload & Product Matching

### Requirement
> - **Image upload** — accept a product image from the user.
> - **Product matching** — analyze the image and return ranked matches from the catalog.
> - **Optional user prompt** — allow the user to add a natural-language query to narrow or adjust results.

### Solution
The solution implements a **Staged Retrieval & Ranking Pipeline** in `apps/api/src/services/image-search.service.ts`:

1.  **Stage 1: Vision Signal Extraction (Multimodal)**
    - The uploaded image (processed via `@fastify/multipart`) is sent to **Gemini 2.5 Flash**.
    - The model extracts structured "signals" (Category, Type, Material, Color, Style) and generates descriptive keywords.
    - **Optimization:** If a user prompt is provided, it is sent to the vision model to guide feature extraction (e.g., focusing on "legs" if the user asks about "wooden legs").

2.  **Retrieval (Heuristic Filters)**
    - A MongoDB query fetches a broad set of candidates (`topN`) using the extracted signals.
    - **Adaptive Filtering:** If the vision confidence is high (> threshold), strict category/type filters are applied. If low, the system falls back to a broader keyword-based search (Plan D) to avoid zero-result pages.

3.  **Stage 2: Semantic Reranking (LLM)**
    - The top K candidates from the retrieval stage are sent to **Gemini 3 Flash Preview**.
    - The LLM acts as a "Shopping Assistant", evaluating how well each candidate matches both the visual signals and the user's optional specific instructions.
    - **Outcome:** This allows for nuanced understanding (e.g., "modern but rustic") that a simple keyword match cannot achieve.

---

## 3. Admin Interface

### Requirement
> The client must include an **admin page or tab** — this is an **internal, back-office interface**... served as the configuration surface for the product matching functionality.

### Solution
- **Access:** Located at `/admin` (Front-end) and guarded by a simple System Management Token (`x-admin-token`).
- **Capabilities:**
  - **Configuration (`ConfigPanel`):** Allows runtime adjustment of weighting parameters (Visual Match vs. Text Match), thresholds (Confidence scores), and feature flags (Enable/Disable LLM Reranking).
  - **Telemetry (`TelemetryPanel`):** visualize real-time request logs, latency breakdowns (Vision vs. Mongo vs. Rerank), and error rates.
  - **Feedback Loop:** These settings are injected into the *next* request immediately via `AppConfigService`, allowing for rapid iteration on ranking quality without redeployment.

---

## 4. Evaluation

### Requirement
> Think about how you would evaluate the quality of the matching results. Document your approach... and if feasible, incorporate a lightweight evaluation mechanism.

### Solution
A dedicated evaluation suite was built in `apps/api/scripts/evaluate-quality.ts`:

- **Methodology:** We use a **"Golden Set"** (`apps/api/golden-set.json`) containing representative test cases with known "correct" matches.
- **Metrics:**
  - **Hit@K:** (Precision) Percentage of times the correct item appears in the top 1, 3, 5, or 10 results.
  - **MRR (Mean Reciprocal Rank):** Measures how high up the list the correct answer appears on average.
- **Augmented Testing:** The script runs two passes:
  1.  **Baseline (Image Only):** Tests raw visual search capability.
  2.  **Augmented (Image + Prompt):** Tests ability to refine search (e.g., "Show me the green version").
- **Reporting:** The script outputs a comparison table showing the "Prompt Lift" — the quantitative improvement provided by adding natural language context.

---

## 5. Edge Cases & Reliability

### Requirement
> Graceful handling of edge cases (e.g. unrecognizable images, API failures, no good matches).

### Solution
- **Timeouts:** Implementing `Promise.race` timeouts for external AI calls preventing the request from hanging indefinitely if the provider is slow (`timeoutsMs` config).
- **Fallbacks:**
  - **Vision Fail:** If the vision model errors or produces low confidence, the system falls back to a text-only search if a user prompt exists.
  - **Rerank Fail:** If the Stage 2 reranker fails (latency/error), the system gracefully falls back to the Stage 1.5 Heuristic Score, ensuring the user still gets results.
- **Rate Limiting:** `fastify-rate-limit` protects the API from abuse.
- **User Feedback:** The UI displays specific "Notices" (e.g., "Low confidence detection - showing broader results") to manage user expectations.

---

## 6. Principles & Stack

### Requirement
> - **Principles:** KISS, DRY, separation of concerns...
> - **Stack:** React + TypeScript, Node.js + TypeScript.

### Solution
- **Architecture:**
  - **Clean Architecture:** `apps/api` is structured into `domain` (business logic/schemas), `infra` (external services/db), and `interfaces` (http routes).
  - **Features:** `apps/web` uses a Feature-based folder structure to keep related components and logic together.
- **Type Safety:** Shared types ensure specific schemas (like `SearchResponse` and `Product`) are consistent across the Full Stack.
- **Simplicity:**
  - Avoided complex vector databases (Pinecone/Weaviate) in favor of **smart heuristics + LLM Reranking**. This keeps the "Write" path simple (no vector embedding synchronization needed) while achieving high-quality "Read" results via the LLM's reasoning capabilities.
