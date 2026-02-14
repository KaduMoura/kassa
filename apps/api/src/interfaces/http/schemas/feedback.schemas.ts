import { z } from 'zod';

export const FeedbackBodySchema = z.object({
    feedback: z.object({
        items: z.record(z.string(), z.enum(['thumbs_up', 'thumbs_down'])),
        notes: z.string().optional()
    })
});

export const FeedbackParamsSchema = z.object({
    requestId: z.string()
});
