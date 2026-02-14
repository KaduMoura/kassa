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
    }),
});

export type ImageSignals = z.infer<typeof ImageSignalsSchema>;

export enum AiErrorCode {
    AI_TIMEOUT = 'AI_TIMEOUT',
    AI_RATE_LIMIT = 'AI_RATE_LIMIT',
    AI_AUTH_ERROR = 'AI_AUTH_ERROR',
    AI_INVALID_OUTPUT = 'AI_INVALID_OUTPUT',
    AI_NETWORK_ERROR = 'AI_NETWORK_ERROR',
    AI_INTERNAL_ERROR = 'AI_INTERNAL_ERROR',
    AI_CONTEXT_TOO_LARGE = 'AI_CONTEXT_TOO_LARGE',
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
