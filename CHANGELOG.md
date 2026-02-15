# Changelog

All notable changes to the Inspira AI project will be documented in this file.

## [1.3.1]

### Improved
- **Heuristic Scorer**: Replaced exact string matching with **Fuzzy Token Matching** to improve recall and scoring accuracy for candidates with partial keyword overlaps.
- **Admin Integration**: Configured Ranking Weights (Price, Text, etc.) are now injected into the **Gemini 3 Reranker** prompt, ensuring the AI respects business logic.
- **Strict Category Filter**: Connected the admin toggle `useCategoryFilter` to correctly switch between precision (strict) and recall (broad) retrieval modes.

## [1.3.0]

### Added
- **Model Upgrade**: Defaulted Vision to `gemini-2.5-flash` and Reranker to `gemini-3-flash-preview` for improved accuracy and speed.
- **Next.js 16**: Upgraded frontend to Next.js 16 (App Router) for better performance and React 19 support.
- **Juicy Animations**: Integrated `framer-motion` for premium micro-interactions and layout transitions.
- **Docker Split**: Separated `docker-compose.yml` (dev) and `docker-compose.prod.yml` (prod) for cleaner environment management.
- **Branding**: Updated Inspira AI branding, hero section, and typography.

### Changed
- **Documentation**: Updated `README.md`, `WORKFLOW.md`, and `WORKFLOW_DIAGRAMS.md` to reflect the new AI models and system architecture.

## [1.2.0]

### Added
- **Frontend Search Experience**: Implemented a premium, AI-powered search interface.
- **Image Intelligence**: Integrated Gemini Vision for visual signal extraction and reranking.
- **State Management**: Built a robust search state machine with `useSearchController` to manage complex async flows.
- **UI Components**: 
    - `UploadPanel`: Drag-and-drop support with instant previews and validation.
    - `PromptInput`: Contextual search refinement with character limits.
    - `ResultsList`: Dynamic grid featuring loading skeletons and visual match bands (HIGH/MEDIUM/LOW).
- **Security**: Implemented secure, in-memory API key handling via `ApiKeyModal`.
- **Admin Console**: Built a comprehensive dashboard for system tuning and observability.
    - `ConfigPanel`: Direct management of AI weights, thresholds, and retries.
    - `TelemetryPanel`: Real-time monitoring of search latencies and success rates.
- **Feedback Loop**: Integrated item-level "Thumbs Up/Down" feedback to correlate accuracy with search telemetry.

### Technical
- Implemented `requestId` correlation across the frontend state machine.
- Enhanced `apiClient` with Admin and Feedback endpoints.
- Built a secure (token-based) Admin Portal with tabbed navigation.

### Technical
- Defined strict TypeScript contracts for Domain and API layers.
- Implemented a typed `apiClient` for backend communication.
- Extended the Tailwind design system with custom premium tokens.

## [1.1.0]

### Added
- **Developer Experience**: Added `pnpm eval:golden` and `pnpm demo` scripts for streamlined reviewer testing.
- **Configurable Operational Limits**: Environment-driven `MAX_UPLOAD_BYTES`, `STAGE1_TIMEOUT_MS`, and `STAGE2_TIMEOUT_MS`.
- **Flexible UI Configuration**: Added `AI_PROVIDER`, `GEMINI_MODEL_VISION`, and `GEMINI_MODEL_RERANK` to environment settings.
- **Compliance Alignment**: Aligned API routes strictly with `docs/05.1`:
    - `/api/config` (Admin Configuration)
    - `/api/telemetry` (Search Insights)
    - `/api/feedback/:requestId` (User Feedback)
- **Enhanced Observability**: Added masked configuration logs on startup to verify system environment without secret exposure.

### Improved
- **Evaluation Script**: Enhanced `evaluate-quality.ts` with "Prompt Lift" metrics to measure objective value of user prompts.
- **CI Stability**: Added Docker build verification job to GitHub Actions workflow.

## [1.0.0]

### Added
- **AI Search Pipeline**: Implemented two-stage pipeline with Google Gemini (Vision extraction + LLM Reranking).
- **Signal Extraction**: Robust signal extraction including category, type, visual attributes, and user intent (price/dimensions).
- **Retrieval Engine**: Multi-plan MongoDB retrieval strategy (A-D) with keyword relaxation for high recall.
- **Robust Fallback**: Implemented Stage 1 failure recovery using User Prompt search as fallback.
- **Image Quality**: Automated dimension validation (rejecting images < 256px) and EXIF metadata stripping.
- **Ranking System**: Combined heuristic scoring (proximity-based) with LLM reranking for high precision.
- **Admin Console**: Back-office API for tuning weights, thresholds, and viewing search telemetry.
- **Observability**: Standardized response envelope `{ data, error, meta }`, requestId correlation, and stage-level timings.
- **Security**: In-memory API key handling, rate-limiting, magic-byte image validation, and log redaction of secrets.
- **Feedback Loop**: Native support for "thumbs up/down" evaluation in telemetry.
- **Quality Assets**: Created `golden-set.json` for repeatable relevance evaluation.
- **Dockerization**: Production-ready Dockerfile and documentation.

### Fixed
- Standardized all error responses to follow the common envelope.
- Fixed admin authentication middleware to safely handle header arrays.
- Corrected search metrics to include fallback flags for better transparency.

## [0.2.0]

### Added
- Basic project scaffolding (Fastify + TypeScript).
- MongoDB integration for product catalog.
- Preliminary Gemini Vision integration.
- Unit testing setup with Vitest.

## [0.1.0]

### Added
- Architecture documentation and API specifications.
- Project initialization and monorepo structure.

---

## Key Agent Prompts

The following prompts were critical in guiding the AI agent to achieve 100% architectural compliance:

- **Signal Extraction Strategy**: "Implement GeminiVisionSignalExtractor utilizing a strict JSON schema for zero-shot extraction of furniture attributes, ensuring category and type mapping matches the catalog domain."
- **Retrieval Ladder**: "Design a MongoDB retrieval strategy in CatalogRepository that implements a 'relaxation ladder' (Plans A-D), prioritizing high-precision category/type matches before falling back to broad keyword regex search."
- **Heuristic vs LLM Ranking**: "Implement a two-stage ranking pipeline: Stage 1 uses a deterministic HeuristicScorer based on metadata proximity; Stage 2 uses Gemini as a relative reranker to refine the top results based on visual nuance."
- **Observability & Masking**: "Configure Fastify to use pino-pretty for development and structured JSON for production, ensuring mandatory masking of sensitive headers like x-ai-api-key and x-admin-token in all logs."
- **Quality Evaluation**: "Create an automated evaluation script that measures Hit@K and MRR across both Image-Only and Image+Prompt scenarios, specifically calculating 'Prompt Lift' to quantify query utility."
