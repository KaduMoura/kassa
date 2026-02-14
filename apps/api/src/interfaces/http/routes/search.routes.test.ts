import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import { searchRoutes } from './search.routes';

// Mock dependencies
const mockSearchByImage = vi.fn();

vi.mock('../../../infra/ai/gemini/gemini-vision.service', () => ({
    GeminiVisionSignalExtractor: vi.fn().mockImplementation(() => ({}))
}));
vi.mock('../../../infra/ai/gemini/gemini-reranker.service', () => ({
    GeminiCatalogReranker: vi.fn().mockImplementation(() => ({}))
}));
vi.mock('../../../infra/repositories/catalog.repository', () => ({
    CatalogRepository: vi.fn().mockImplementation(() => ({}))
}));
vi.mock('../../../services/image-search.service', () => ({
    ImageSearchService: vi.fn().mockImplementation(() => ({
        searchByImage: mockSearchByImage
    }))
}));

describe('Search Routes Integration', () => {
    const server = Fastify();

    beforeEach(async () => {
        vi.clearAllMocks();
        if (!server.hasContentTypeParser('multipart/form-data')) {
            await server.register(multipart);
            await server.register(searchRoutes);
        }
    });

    it('should return 400 if x-ai-api-key is missing', async () => {
        const response = await server.inject({
            method: 'POST',
            url: '/',
        });

        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.body);
        expect(body.error.code).toBe('VALIDATION_HEADERS');
        expect(body.error.message).toContain('Invalid headers');
    });

    it('should return 400 if not multipart', async () => {
        const response = await server.inject({
            method: 'POST',
            url: '/',
            headers: {
                'x-ai-api-key': 'test-key'
            }
        });

        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.body);
        expect(body.error.code).toBe('VALIDATION_MULTIPART');
        expect(body.error.message).toContain('Expected multipart');
    });

    it('should return 400 for invalid mimetype', async () => {
        const boundary = '----boundary';
        const failBody = [
            `--${boundary}`,
            'Content-Disposition: form-data; name="image"; filename="test.txt"',
            'Content-Type: text/plain',
            '',
            'fake content',
            `--${boundary}--`
        ].join('\r\n');

        const response = await server.inject({
            method: 'POST',
            url: '/',
            headers: {
                'x-ai-api-key': 'test-key',
                'content-type': `multipart/form-data; boundary=${boundary}`
            },
            payload: failBody
        });

        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.body);
        expect(body.error.code).toBe('VALIDATION_IMAGE_FORMAT');
        expect(body.error.message).toContain('Invalid file type');
    });

    it('should return 400 for too long prompt', async () => {
        const boundary = '----boundary';
        const longPrompt = 'a'.repeat(1001);
        const body = [
            `--${boundary}`,
            'Content-Disposition: form-data; name="prompt"',
            '',
            longPrompt,
            `--${boundary}--`
        ].join('\r\n');

        const response = await server.inject({
            method: 'POST',
            url: '/',
            headers: {
                'x-ai-api-key': 'test-key',
                'content-type': `multipart/form-data; boundary=${boundary}`
            },
            payload: body
        });

        expect(response.statusCode).toBe(400);
        const errorBody = JSON.parse(response.body);
        expect(errorBody.error.code).toBe('VALIDATION_PROMPT');
        expect(errorBody.error.message).toContain('Invalid prompt');
    });

    it('should return 200 on successful pipeline', async () => {
        const boundary = '----boundary';
        const jpegMagicBytes = Buffer.from([0xFF, 0xD8, 0xFF, 0x00]);
        const body = Buffer.concat([
            Buffer.from([
                `--${boundary}`,
                'Content-Disposition: form-data; name="image"; filename="t.jpg"',
                'Content-Type: image/jpeg',
                '',
                ''
            ].join('\r\n')),
            jpegMagicBytes,
            Buffer.from([
                '',
                `--${boundary}`,
                'Content-Disposition: form-data; name="prompt"',
                '',
                'some prompt',
                `--${boundary}--`
            ].join('\r\n'))
        ]);

        const mockResponse = {
            query: { signals: { categoryGuess: { value: 'test' } } },
            results: [],
            meta: {
                requestId: 'test-req',
                timings: { totalMs: 100, stage1Ms: 20, mongoMs: 30, stage2Ms: 50 },
                notices: [{ code: 'TEST', message: 'test' }]
            }
        };
        mockSearchByImage.mockResolvedValueOnce(mockResponse);

        const response = await server.inject({
            method: 'POST',
            url: '/',
            headers: {
                'x-ai-api-key': 'test-key',
                'content-type': `multipart/form-data; boundary=${boundary}`
            },
            payload: body
        });

        expect(response.statusCode).toBe(200);
        const payload = JSON.parse(response.body);
        expect(payload.meta).toBeDefined();
        expect(payload.meta.requestId).toBe('test-req');
        expect(payload.meta.timings.totalMs).toBe(100);
        expect(payload.meta.notices).toHaveLength(1);
        expect(mockSearchByImage).toHaveBeenCalled();
    });

    it('should return 400 for invalid magic bytes', async () => {
        const boundary = '----boundary';
        const body = [
            `--${boundary}`,
            'Content-Disposition: form-data; name="image"; filename="t.jpg"',
            'Content-Type: image/jpeg',
            '',
            'not-an-image-at-all',
            `--${boundary}--`
        ].join('\r\n');

        const response = await server.inject({
            method: 'POST',
            url: '/',
            headers: {
                'x-ai-api-key': 'test-key',
                'content-type': `multipart/form-data; boundary=${boundary}`
            },
            payload: body
        });

        expect(response.statusCode).toBe(400);
        expect(JSON.parse(response.body).error.message).toContain('Magic bytes do not match');
    });

    it('should return 400 for images smaller than 256px', async () => {
        const boundary = '----boundary';
        // 10x10 black pixel JPEG
        const smallJpeg = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAAKAAoBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');

        const body = Buffer.concat([
            Buffer.from([
                `--${boundary}`,
                'Content-Disposition: form-data; name="image"; filename="small.jpg"',
                'Content-Type: image/jpeg',
                '',
                ''
            ].join('\r\n')),
            smallJpeg,
            Buffer.from([
                '',
                `--${boundary}--`
            ].join('\r\n'))
        ]);

        const response = await server.inject({
            method: 'POST',
            url: '/',
            headers: {
                'x-ai-api-key': 'test-key',
                'content-type': `multipart/form-data; boundary=${boundary}`
            },
            payload: body
        });

        expect(response.statusCode).toBe(400);
        expect(JSON.parse(response.body).error.message).toContain('Image too small');
    });

    it('should handle stage 1 failures with prompt fallback', async () => {
        const boundary = '----boundary';
        const jpegMagicBytes = Buffer.from([0xFF, 0xD8, 0xFF, 0x00]);
        const body = Buffer.concat([
            Buffer.from([
                `--${boundary}`,
                'Content-Disposition: form-data; name="image"; filename="t.jpg"',
                'Content-Type: image/jpeg',
                '',
                ''
            ].join('\r\n')),
            jpegMagicBytes,
            Buffer.from([
                '',
                `--${boundary}`,
                'Content-Disposition: form-data; name="prompt"',
                '',
                'fallback keyword',
                `--${boundary}--`
            ].join('\r\n'))
        ]);

        const mockResponse = {
            query: { signals: { categoryGuess: { value: 'unknown' } } },
            results: [],
            meta: {
                requestId: 'test-fallback',
                notices: [{ code: 'VISION_FALLBACK', message: 'Fallback used' }]
            }
        };
        mockSearchByImage.mockResolvedValueOnce(mockResponse);

        const response = await server.inject({
            method: 'POST',
            url: '/',
            headers: {
                'x-ai-api-key': 'test-key',
                'content-type': `multipart/form-data; boundary=${boundary}`
            },
            payload: body
        });

        expect(response.statusCode).toBe(200);
        const payload = JSON.parse(response.body);
        expect(payload.meta.notices.find((n: any) => n.code === 'VISION_FALLBACK')).toBeDefined();
    });
});
