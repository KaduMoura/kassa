import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiCatalogReranker } from './gemini-reranker.service';
import { ImageSignals } from '../../../domain/ai/schemas';

const mockGenerateContent = vi.fn();
const mockGetGenerativeModel = vi.fn().mockReturnValue({
    generateContent: mockGenerateContent,
});

vi.mock('@google/generative-ai', () => ({
    GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
        getGenerativeModel: mockGetGenerativeModel,
    })),
}));

describe('GeminiCatalogReranker', () => {
    let reranker: GeminiCatalogReranker;

    beforeEach(() => {
        reranker = new GeminiCatalogReranker();
        vi.clearAllMocks();
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
            rankedIds: ['2', '1'],
            reasons: { '2': ['Better type match'] }
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

    it('should handle missing products by appending them to the end', async () => {
        const mockOutput = {
            rankedIds: ['2'], // Missing ID '1'
            reasons: {}
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
