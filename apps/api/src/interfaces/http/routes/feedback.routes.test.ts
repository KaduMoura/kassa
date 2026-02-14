import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { feedbackRoutes } from './feedback.routes';
import { telemetryService } from '../../../services/telemetry.service';

describe('Feedback Routes', () => {
    it('should submit feedback for an existing request', async () => {
        const fastify = Fastify();
        await fastify.register(feedbackRoutes);

        // Record a mock event first
        telemetryService.record({
            requestId: 'test-req-123',
            timings: { totalMs: 0, stage1Ms: 0, mongoMs: 0, stage2Ms: 0 },
            counts: { retrieved: 0, reranked: 0, returned: 0 },
            fallbacks: { visionFallback: false, rerankFallback: false, broadRetrieval: false },
            error: null
        });

        const response = await fastify.inject({
            method: 'POST',
            url: '/test-req-123',
            payload: {
                feedback: {
                    items: { 'prod-1': 'thumbs_up' },
                    notes: 'Great match'
                }
            }
        });

        expect(response.statusCode).toBe(200);
        const payload = JSON.parse(response.body);
        expect(payload.data.success).toBe(true);

        const events = telemetryService.getEvents();
        const event = events.find(e => e.requestId === 'test-req-123');
        expect(event?.feedback?.notes).toBe('Great match');
        expect(event?.feedback?.items['prod-1']).toBe('thumbs_up');
    });

    it('should return 404 for non-existent request', async () => {
        const fastify = Fastify();
        await fastify.register(feedbackRoutes);

        const response = await fastify.inject({
            method: 'POST',
            url: '/non-existent',
            payload: {
                feedback: { items: {} }
            }
        });

        expect(response.statusCode).toBe(404);
        expect(JSON.parse(response.body).error.code).toBe('REQUEST_NOT_FOUND');
    });
});
