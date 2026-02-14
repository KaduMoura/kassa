import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ImageSearchService } from './image-search.service';
import { VisionSignalExtractor, CatalogReranker } from '../domain/ai/interfaces';
import { CatalogRepository } from '../infra/repositories/catalog.repository';
import { ImageSignals, RerankResult } from '../domain/ai/schemas';
import { Product } from '../domain/product';

describe('ImageSearchService', () => {
    let service: ImageSearchService;
    let mockVision: VisionSignalExtractor;
    let mockRepo: CatalogRepository;
    let mockReranker: CatalogReranker;

    const mockSignals: ImageSignals = {
        categoryGuess: { value: 'furniture', confidence: 0.9 },
        typeGuess: { value: 'sofa', confidence: 0.8 },
        attributes: { style: ['modern'], material: ['fabric'], color: ['grey'], shape: ['L-shape'] },
        keywords: ['grey sofa', 'modern couch'],
        qualityFlags: { isFurnitureLikely: true, multipleObjects: false, lowImageQuality: false, occludedOrPartial: false }
    };

    const mockProducts: Product[] = [
        { _id: '1' as any, title: 'Sofa 1', description: 'desc 1', category: 'furniture', type: 'sofa', price: 100, width: 1, height: 1, depth: 1 },
        { _id: '2' as any, title: 'Sofa 2', description: 'desc 2', category: 'furniture', type: 'sofa', price: 200, width: 1, height: 1, depth: 1 },
    ];

    beforeEach(() => {
        mockVision = {
            extractSignals: vi.fn()
        };
        mockRepo = {
            findCandidates: vi.fn(),
            findById: vi.fn(),
            getSample: vi.fn(),
            collection: {} as any
        } as unknown as CatalogRepository;
        mockReranker = {
            rerank: vi.fn()
        };

        service = new ImageSearchService(mockVision, mockRepo, mockReranker);
    });

    describe('searchByImage', () => {
        it('should complete full pipeline successfully', async () => {
            vi.mocked(mockVision.extractSignals).mockResolvedValue(mockSignals);
            vi.mocked(mockRepo.findCandidates).mockResolvedValue(mockProducts);
            vi.mocked(mockReranker.rerank).mockResolvedValue({
                rankedIds: ['2', '1'],
                reasons: { '2': ['better match'] }
            });

            const result = await service.searchByImage(Buffer.from(''), 'image/jpeg', 'key', 'req1');

            expect(result.signals).toEqual(mockSignals);
            expect(result.candidates).toHaveLength(2);
            expect(result.candidates[0]._id).toBe('2');
            expect(result.candidates[1]._id).toBe('1');
        });

        it('should return empty candidates if repository finds nothing', async () => {
            vi.mocked(mockVision.extractSignals).mockResolvedValue(mockSignals);
            vi.mocked(mockRepo.findCandidates).mockResolvedValue([]);

            const result = await service.searchByImage(Buffer.from(''), 'image/jpeg', 'key', 'req1');

            expect(result.candidates).toHaveLength(0);
            expect(mockReranker.rerank).not.toHaveBeenCalled();
        });

        it('should fallback to initial order if reranking fails', async () => {
            vi.mocked(mockVision.extractSignals).mockResolvedValue(mockSignals);
            vi.mocked(mockRepo.findCandidates).mockResolvedValue(mockProducts);
            vi.mocked(mockReranker.rerank).mockRejectedValue(new Error('AI Failed'));

            const result = await service.searchByImage(Buffer.from(''), 'image/jpeg', 'key', 'req1');

            expect(result.candidates).toHaveLength(2);
            // Fallback order is original repo order
            expect(result.candidates[0]._id).toBe('1');
            expect(result.candidates[1]._id).toBe('2');
        });
    });

    describe('extractSignals', () => {
        it('should call vision extractor with correct params', async () => {
            vi.mocked(mockVision.extractSignals).mockResolvedValue(mockSignals);

            const result = await service.extractSignals(Buffer.from('img'), 'image/png', 'key', 'req-id', 'prompt');

            expect(result).toEqual(mockSignals);
            expect(mockVision.extractSignals).toHaveBeenCalledWith({
                imageBytes: Buffer.from('img'),
                mimeType: 'image/png',
                apiKey: 'key',
                requestId: 'req-id',
                prompt: 'prompt'
            });
        });
    });
});
