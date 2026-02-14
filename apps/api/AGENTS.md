# Backend Agent Context (Kassa API)

This document provides context, patterns, and rules for AI Agents working on the Kassa Backend (`apps/api`).

## 🛠 Tech Stack & Tooling
- **Runtime**: Node.js (Latest LTS)
- **Framework**: Fastify (v4+)
- **Language**: TypeScript (v5+)
- **Database**: MongoDB (v6+ driver)
- **Validation**: Zod (Env, HTTP Body, AI Responses)
- **AI/LLM**: Google Gemini (`@google/generative-ai`) via 2-Stage Pipeline.
- **Testing**: Vitest (Unit & Integration)
- **Linting**: ESLint v9 (Flat Config `eslint.config.mjs`) + Prettier.
- **Package Manager**: `pnpm`

## 🏗 Architecture Overview
The backend follows a pragmatic **DDD-inspired (Domain-Driven Design)** architecture:

```
src/
├── config/         # Environment variables (Zod validated)
├── domain/         # Business logic, entities, and interfaces (No external deps)
│   ├── ai/         # AI Interfaces and Schemas (Signal Extractor, Reranker)
│   └── product.ts  # Product entity
├── infra/          # External implementations (DB, AI SDKs)
│   ├── ai/gemini/  # Gemini implementation of AI interfaces
│   ├── db.ts       # MongoDB connection
│   └── repositories/ # Data access (CatalogRepository)
├── interfaces/     # Entry points (HTTP, CLI)
│   └── http/       # Fastify Routes, Controllers, Schemas
├── services/       # Application Services (Orchestration)
│   └── image-search.service.ts # Core Pipeline Logic
└── server.ts       # App Bootstrap & Global Error Handling
```

## 🧠 Core Logic: Two-Stage Retrieval
The search pipeline is the critical path of this application:

1.  **Stage 1 (Vision Signal Extraction)**:
    - Input: Image Buffer + Optional Prompt.
    - AI: Gemini Vision (Flash model recommended for speed).
    - Output: `ImageSignals` (Keywords, Categories, Attributes).
2.  **Stage 2 (Candidate Retrieval)**:
    - Logic: Heuristic search in MongoDB using Stage 1 signals.
    - Strategy: Plan A (Strict) -> Plan B (Relaxed) -> Plan C (Fallback).
3.  **Stage 3 (Reranking)**:
    - Input: Candidate List + User Prompt + Original Signals.
    - AI: Gemini Pro (Text/Reasoning).
    - Output: Reordered list of IDs with reasoning.

**Key Rule**: If Stage 3 fails, the system **MUST** fallback to the heuristic order from Stage 2. Do not fail the request.

## 📝 Coding Standards & Patterns

### 1. Logging
- **NEVER** use `console.log` or `console.error` in business logic.
- **ALWAYS** inject the `Logger` interface into services or use `request.log` in controllers/routes.
- **Pino** is the underlying logger handled by Fastify.

### 2. Error Handling
- Throw `AiError` (from `domain/ai/schemas.ts`) for any AI-related failures.
- Throw standard `Error` for internal issues.
- **DO NOT** catch errors manually in Controllers errors to send responses. Let the **Global Error Handler** in `server.ts` handle it.
- **Global Handler**: ensure it sanitizes stack traces in production.

### 3. Validation (Zod)
- All HTTP inputs (Headers, Body, Query) must be validated with Zod schemas.
- All AI responses (JSON) must be parsed safely using `schema.safeParse()`.

### 4. Testing
- **Unit Tests**: Mandatory for Services (`*.service.test.ts`). Mock dependencies.
- **Integration Tests**: Creating API tests (`*.routes.test.ts`) using `server.inject()`.
- Use `vi.mock()` for external calls (AI, DB).

### 5. Type Safety
- No `any`. Use `unknown` if strictly necessary and narrow it down.
- Ensure `ObjectId` handling in MongoDB repositories is explicit (convert string <-> ObjectId).

## 🚀 Common Commands

```bash
# Development
pnpm dev

# Quality Checks
pnpm run lint      # Check for style issues (ESLint 9)
pnpm run typecheck # Check for TS errors
pnpm test          # Run Vitest suite

# Build
pnpm build
```

## 🔒 Security & Constraints
- **API Keys**: Clients send `x-ai-api-key`. It is **NOT** stored. Passed through to AI services.
- **Read-Only Catalog**: The `catalog` collection is primarily read-only.
- **Admin**: Routes at `/api/admin` are protected by `x-admin-key`. Currently volatile (in-memory config).
- **Multipart**: Uploads strictly limited to `image/jpeg`, `image/png`, `image/webp` (Max 10MB).
