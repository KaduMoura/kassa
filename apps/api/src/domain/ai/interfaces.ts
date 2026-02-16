import { ImageSignals, CandidateSummary, RerankResult } from './schemas';

export interface AiConfig {
    temperature?: number;
    maxOutputTokens?: number;
    timeoutMs?: number;
    repairTimeoutMs?: number;
}

export interface VisionSignalExtractorInput {
    imageBytes: Buffer;
    mimeType: string;
    prompt?: string;
    requestId: string;
    apiKey: string;
    config?: AiConfig;
}

export interface VisionSignalExtractor {
    extractSignals(input: VisionSignalExtractorInput): Promise<ImageSignals>;
}

export interface CatalogRerankerInput {
    signals: ImageSignals;
    candidates: CandidateSummary[];
    prompt?: string;
    requestId: string;
    apiKey: string;
    config?: AiConfig;
    weights?: any;
}

export interface CatalogReranker {
    rerank(input: CatalogRerankerInput): Promise<RerankResult>;
}
