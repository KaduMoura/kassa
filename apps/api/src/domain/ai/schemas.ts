import { z } from 'zod';

export const ImageSignalsSchema = z.object({
    categoryGuess: z.object({
        value: z.string(),
        confidence: z.number().min(0).max(1),
    }),
    typeGuess: z.object({
        value: z.string(),
        confidence: z.number().min(0).max(1),
    }),
    attributes: z.object({
        style: z.array(z.string()).default([]),
        material: z.array(z.string()).default([]),
        color: z.array(z.string()).default([]),
        shape: z.array(z.string()).default([]),
    }),
    keywords: z.array(z.string()).max(10).default([]),
    qualityFlags: z.object({
        isFurnitureLikely: z.boolean().default(true),
        multipleObjects: z.boolean().default(false),
        lowImageQuality: z.boolean().default(false),
        occludedOrPartial: z.boolean().default(false),
        lowConfidence: z.boolean().default(false),
    }),
    intent: z.object({
        priceMax: z.number().optional(),
        priceMin: z.number().optional(),
        preferredWidth: z.number().optional(),
        preferredHeight: z.number().optional(),
        preferredDepth: z.number().optional(),
    }).optional(),
});

export type ImageSignals = z.infer<typeof ImageSignalsSchema>;

export const CandidateSummarySchema = z.object({
    id: z.string(),
    title: z.string(),
    category: z.string(),
    type: z.string(),
    price: z.number(),
    width: z.number().optional(),
    height: z.number().optional(),
    depth: z.number().optional(),
    description: z.string().max(300),
});

export type CandidateSummary = z.infer<typeof CandidateSummarySchema>;

export enum MatchBand {
    HIGH = 'HIGH',
    MEDIUM = 'MEDIUM',
    LOW = 'LOW',
}

export const ScoredCandidateSchema = CandidateSummarySchema.extend({
    score: z.number(),
    matchBand: z.nativeEnum(MatchBand),
    reasons: z.array(z.string()).default([]),
});

export type ScoredCandidate = z.infer<typeof ScoredCandidateSchema>;

export type RetrievalPlan = 'A' | 'B' | 'C' | 'D' | 'TEXT';

export interface SearchTimings {
    totalMs: number;
    stage1Ms: number;
    mongoMs: number;
    stage2Ms: number;
}

export interface SearchNotice {
    code: string;
    message: string;
}

export interface SearchResponse {
    query: {
        prompt?: string;
        signals: ImageSignals;
    };
    results: ScoredCandidate[];
    meta: {
        requestId: string;
        timings: SearchTimings;
        notices: SearchNotice[];
        retrievalPlan?: RetrievalPlan;
    };
}

export const RerankResultSchema = z.object({
    rankedIds: z.array(z.string()),
    reasons: z.record(z.string(), z.array(z.string())).optional(),
    matchBands: z.record(z.string(), z.nativeEnum(MatchBand)).optional(),
});

export type RerankResult = z.infer<typeof RerankResultSchema>;

export enum AiErrorCode {
    PROVIDER_TIMEOUT = 'PROVIDER_TIMEOUT',
    PROVIDER_RATE_LIMIT = 'PROVIDER_RATE_LIMIT',
    PROVIDER_AUTH_ERROR = 'PROVIDER_AUTH_ERROR',
    PROVIDER_INVALID_RESPONSE = 'PROVIDER_INVALID_RESPONSE',
    PROVIDER_NETWORK_ERROR = 'PROVIDER_NETWORK_ERROR',
    INTERNAL_ERROR = 'INTERNAL_ERROR',
    PROVIDER_CONTEXT_TOO_LARGE = 'PROVIDER_CONTEXT_TOO_LARGE',
}

export class AiError extends Error {
    constructor(
        public readonly code: AiErrorCode,
        message: string,
        public readonly originalError?: any
    ) {
        super(message);
        this.name = 'AiError';
    }
}
