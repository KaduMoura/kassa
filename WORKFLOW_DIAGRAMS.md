# System Workflow Diagrams

## 1. High-Level User Journey
This diagram illustrates the complete end-to-end flow from the user's perspective, including configuration and feedback.

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant FE as Frontend (Web)
    participant API as API Gateway (Fastify)
    participant Svc as ImageSearchService
    participant AI as AI System (Gemini)
    participant DB as Database (Mongo)
    participant Tel as Telemetry (In-Memory)

    User->>FE: Click "Set API Key" & Input Key
    FE->>FE: Store Key (Local State)
    
    User->>FE: Upload Image + Optional Prompt
    FE->>FE: Compress Image
    FE->>API: POST /api/search (Multipart + x-ai-api-key)
    API->>API: Validate Header & Image Magic Bytes
    API->>Svc: Process Search Request
    
    rect rgb(240, 248, 255)
        note right of Svc: Stage 1: Recognition
        Svc->>AI: Vision Analysis (Gemini 2.5 Flash)
        AI-->>Svc: Extracted Signals (JSON)
    end

    rect rgb(255, 250, 240)
        note right of Svc: Retrieval & Scoring
        Svc->>DB: Query Candidates (Filter + Text)
        DB-->>Svc: Candidate Products
        Svc->>Svc: Heuristic Scoring
    end

    rect rgb(240, 255, 240)
        note right of Svc: Stage 2: Reasoning
        Svc->>AI: Rerank Top Candidates (Gemini 3 Flash Preview)
        AI-->>Svc: Reordered List
    end

    Svc->>Tel: Record Event (Ring Buffer)
    Svc-->>API: Formatted Results
    API-->>FE: Search Response (JSON)
    FE->>User: Display Results Grid

    opt User Feedback
        User->>FE: Click "Thumbs Up/Down"
        FE->>API: POST /api/feedback/:requestId
        API->>Tel: Update Event with Feedback
    end
```

## 2. Detailed Backend Pipeline
A deeper look into the `ImageSearchService` orchestration, logic branching, and error handling.

```mermaid
sequenceDiagram
    participant Svc as ImageSearchService
    participant Vision as VisionExtractor
    participant Repo as CatalogRepository
    participant Scorer as HeuristicScorer
    participant Rerank as CatalogReranker
    
    Note over Svc: Request Started

    %% Stage 1
    Svc->>Vision: extractSignals(image, prompt, apiKey)
    alt Vision Success
        Vision-->>Svc: { category, materials, keywords... }
    else Vision Failure
        Vision-->>Svc: Error
        opt Has User Prompt?
            Svc->>Svc: Fallback: Use User Prompt as Keyword
        end
    end

    %% Retrieval
    Svc->>Repo: findCandidates(signals)
    Repo-->>Svc: [Product A, Product B, ...] (50-100 items)
    
    alt No Candidates
        Svc-->>Svc: Return Empty Result
    else Candidates Found
        %% Heuristic Scoring
        loop For each Candidate
            Svc->>Scorer: score(candidate, signals)
        end
        Svc->>Svc: Sort by Heuristic Score
    end

    %% Stage 2 Reranking
    opt Reranking Enabled & Candidates > 0
        Svc->>Rerank: rerank(signals, Top-M Candidates, apiKey, Weights)
        alt Rerank Success
            Rerank-->>Svc: { rankedIds: [...], reasons: {...} }
            Svc->>Svc: Reorder based on AI Rank
        else Rerank Failure / Timeout
            Note right of Svc: Log Error & Continue
            Svc->>Svc: Keep Heuristic Order (Fallback)
        end
    end

    Note over Svc: Final Response Construction
```

## 3. Failure & Repair Strategy
How the system handles AI unreliability (JSON errors) and Service failures.

```mermaid
sequenceDiagram
    participant Svc as ImageSearchService
    participant LLM as Gemini Model
    participant Repair as Repair LLM (Flash 2.5)

    Svc->>LLM: Generate JSON (Vision or Rerank)
    
    alt Valid JSON
        LLM-->>Svc: Valid JSON String
    else Malformed JSON
        LLM-->>Svc: Broken JSON (e.g. missing braces)
        
        note right of Svc: "Repair" strategy triggered
        
        loop Max 2 Attempts
            Svc->>Repair: "Fix this JSON: <broken_json>"
            Repair-->>Svc: Fixed JSON
            Svc->>Svc: Validate Schema
        end
        
        alt Repair Success
            Svc->>Svc: Use Repaired Data
        else Repair Failed
            Svc-->>Svc: Throw AI_PROVIDER_INVALID_RESPONSE
        end
    end

    opt Operation threw Error
        Svc->>Svc: Check if Retriable (500, RateLimit)
        loop Exponential Backoff
            Svc->>LLM: Retry Request
        end
    end
```
