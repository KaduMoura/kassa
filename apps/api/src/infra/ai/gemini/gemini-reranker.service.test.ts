import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GeminiCatalogReranker } from './gemini-reranker.service';
import { ImageSignals } from '../../../domain/ai/schemas';

const mockGenerateContent = vi.fn();
const mockGetGenerativeModel = vi.fn().mockReturnValue({
    generateContent: mockGenerateContent,
});

vi.mock('@google/generative-ai', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@google/generative-ai')>();
    return {
        ...actual,
        GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
            getGenerativeModel: mockGetGenerativeModel,
        })),
    };
});

describe('GeminiCatalogReranker', () => {
    let reranker: GeminiCatalogReranker;

    beforeEach(() => {
        reranker = new GeminiCatalogReranker();
        vi.clearAllMocks();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    const mockSignals: ImageSignals = {
        categoryGuess: { value: 'Chair', confidence: 0.9 },
        typeGuess: { value: 'Dining Chair', confidence: 0.8 },
        attributes: { style: [], material: [], color: [], shape: [] },
        keywords: ['modern chair'],
        qualityFlags: { isFurnitureLikely: true, multipleObjects: false, lowImageQuality: false, occludedOrPartial: false, lowConfidence: false }
    };

    const mockCandidates = [
        { id: '1', title: 'Product 1', category: 'Chair', type: 'Dining Chair', price: 100, description: 'Desc 1' },
        { id: '2', title: 'Product 2', category: 'Chair', type: 'Office Chair', price: 200, description: 'Desc 2' },
    ];

    it('should successfully rerank candidates', async () => {
        const mockOutput = {
            results: [
                { id: '2', reasons: ['Better type match'] },
                { id: '1', reasons: [] }
            ]
        };

        mockGenerateContent.mockResolvedValue({
            response: {
                text: () => JSON.stringify(mockOutput),
            },
        });

        const result = await reranker.rerank({
            signals: mockSignals,
            candidates: mockCandidates,
            apiKey: 'fake-key',
            requestId: 'test-req',
        });

        expect(result.rankedIds).toEqual(['2', '1']);
        expect(result.reasons?.['2']).toContain('Better type match');
    });

    it('should successfully repair malformed JSON using fallback model', async () => {
        const malformedJson = "Invalid JSON { [";
        const fixedOutput = {
            results: [
                { id: '1', reasons: ['Repair match'] },
                { id: '2', reasons: [] }
            ]
        };

        // First call fails (primary model)
        mockGenerateContent.mockResolvedValueOnce({
            response: { text: () => malformedJson },
        });

        // Second call (repair attempt 1) succeeds
        mockGenerateContent.mockResolvedValueOnce({
            response: { text: () => JSON.stringify(fixedOutput) },
        });

        const result = await reranker.rerank({
            signals: mockSignals,
            candidates: mockCandidates,
            apiKey: 'fake-key',
            requestId: 'repair-req',
        });

        expect(result.rankedIds).toEqual(['1', '2']);
        expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    });

    it('should retry repair and fail if all attempts fail', async () => {
        const malformedJson = "Invalid JSON { [";

        // Primary fails
        // All attempts (primary + repair + outer retries) fail
        mockGenerateContent.mockResolvedValue({
            response: { text: () => malformedJson },
        });

        const rerankPromise = reranker.rerank({
            signals: mockSignals,
            candidates: mockCandidates,
            apiKey: 'fake-key',
            requestId: 'fail-req',
        });

        // Advance timers for all retry attempts (4 outer * 5 internal = 20 attempts)
        for (let i = 0; i < 25; i++) {
            await vi.runAllTimersAsync();
        }

        await expect(rerankPromise).rejects.toThrow(/Failed to repair JSON after 4 attempts/);

        expect(mockGenerateContent).toHaveBeenCalledTimes(20); // 4 outer * (1 primary + 4 repairs)
    });

    it('should handle missing products by appending them to the end', async () => {
        const mockOutput = {
            results: [
                { id: '2', reasons: [] }
            ]
        };

        mockGenerateContent.mockResolvedValue({
            response: {
                text: () => JSON.stringify(mockOutput),
            },
        });

        const result = await reranker.rerank({
            signals: mockSignals,
            candidates: mockCandidates,
            apiKey: 'fake-key',
            requestId: 'test-req',
        });

        expect(result.rankedIds).toEqual(['2', '1']);
    });
});
