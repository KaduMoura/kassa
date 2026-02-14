# Inspira AI API Service

## Overview
This is the backend service for the Inspira AI Image Search application. It orchestrates the Two-Stage AI Pipeline:
1. **Vision Signal Extraction:** Uses Gemini 2.5 Flash to analyze uploaded images.
2. **Catalog Retrieval:** Searches a read-only MongoDB catalog using heuristic plans (TEXT, A, B, C, D).
3. **Reranking:** Uses Gemini 3 Flash to reorder candidates based on relevance.

Built with **Fastify**, **TypeScript**, and **MongoDB**.

## Getting Started

### Prerequisites
- Node.js v20+
- pnpm
- MongoDB instance (local or remote)
- Google Gemini API Key

### Installation

```bash
cd apps/api
pnpm install
```

### Environment Variables
Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Required variables:
- `PORT`: Service port (default 4000)
- `MONGO_URI`: Connection string to MongoDB
- `CORS_ORIGIN`: Allowed frontend origin
- `ADMIN_TOKEN`: Token for protecting Admin endpoints
- `GEMINI_API_KEY`: For running scripts manually (API keys are usually passed per-request from client)

### Running Locally

```bash
# Development mode (watch)
pnpm dev

# Production build
pnpm build
pnpm start
```

### Seeding Data
To populate the database with demo products and create indexes:

```bash
pnpm seed
```

## Architecture
- **`src/interfaces/http`**: Controllers, Routes, Schemas (Zod), Middleware.
- **`src/domain`**: Core business logic, Entities, ranking interfaces.
- **`src/services`**: Orchestrators (ImageSearch, Telemetry).
- **`src/infra`**: External adapters (MongoDB, Gemini).
- **`src/config`**: Environment and App Configuration.

## Key Endpoints
- `POST /api/search`: Main search endpoint (multipart/form-data).
- `GET /health`: Healthcheck.
- `GET /api/admin/config`: Get current tuning parameters.
- `PUT /api/admin/config`: Update parameters (requires `x-admin-token`).
- `GET /api/admin/telemetry/export`: Download recent search telemetry.

## Evaluation
To run the automated quality evaluation against the Golden Set:

1. Place test images in `eval/images/`.
2. Ensure `golden-set.json` matches the images.
3. Run:

```bash
export GEMINI_API_KEY=your_key
npx ts-node scripts/evaluate-quality.ts
```

## Testing
Run unit and integration tests:

```bash
pnpm test
```
