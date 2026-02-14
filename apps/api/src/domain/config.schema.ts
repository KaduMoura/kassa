import { z } from 'zod';

export const AdminConfigSchema = z.object({
    candidateTopN: z.number().int().min(1).max(200).default(60),
    minCandidates: z.number().int().min(1).max(100).default(10),
    useCategoryFilter: z.boolean().default(true),
    useTypeFilter: z.boolean().default(false),
    minCategoryConfidence: z.number().min(0).max(1).default(0.35),
    minTypeConfidence: z.number().min(0).max(1).default(0.35),
    maxKeywordsForRetrieval: z.number().int().min(1).max(20).default(8),
    weights: z.object({
        text: z.number().min(0).max(1).default(0.55),
        category: z.number().min(0).max(1).default(0.15),
        type: z.number().min(0).max(1).default(0.20),
        attributes: z.number().min(0).max(1).default(0.05),
        dimensions: z.number().min(0).max(1).default(0.03),
        price: z.number().min(0).max(1).default(0.02),
    }).default({}),
    matchBands: z.object({
        high: z.number().min(0).max(1).default(0.80),
        medium: z.number().min(0).max(1).default(0.55),
    }).default({}),
    enableLLMRerank: z.boolean().default(true),
    llmRerankTopM: z.number().int().min(1).max(60).default(30),
    maxDescriptionChars: z.number().int().min(1).max(500).default(240),
    rerankOutputK: z.number().int().min(1).max(25).default(10),
    timeoutsMs: z.object({
        stage1: z.number().int().min(100).max(30000).default(6000),
        mongo: z.number().int().min(100).max(10000).default(2000),
        stage2: z.number().int().min(100).max(30000).default(7000),
        total: z.number().int().min(100).max(60000).default(15000),
    }).default({}),
    fallbackStrategy: z.enum(['broad', 'prompt-first', 'vision-first', 'heuristic-only']).default('broad'),
});

export type AdminConfig = z.infer<typeof AdminConfigSchema>;

export const DEFAULT_ADMIN_CONFIG: AdminConfig = AdminConfigSchema.parse({});
