import { z } from 'zod';

export const SearchImageHeadersSchema = z.object({
    'x-ai-api-key': z.string().min(1, 'AI API Key is required').max(200, 'API Key too long'),
});

export const SearchImageBodySchema = z.object({
    prompt: z.string().max(1000, 'Prompt too long').optional(),
});

export const SearchImageResponseSchema = z.object({
    signals: z.any(),
    candidates: z.array(z.any()),
});

export type SearchImageHeaders = z.infer<typeof SearchImageHeadersSchema>;
