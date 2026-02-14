import { ImageSignals } from './schemas';

export interface AiConfig {
    temperature?: number;
    maxOutputTokens?: number;
    timeoutMs?: number;
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
