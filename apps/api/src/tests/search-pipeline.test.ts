import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ImageSearchService } from '../services/image-search.service';
import { HeuristicScorer } from '../domain/ranking/heuristic-scorer';
import { AppConfigService } from '../config/app-config.service';
import { TelemetryService } from '../services/telemetry.service';
import { VisionSignalExtractor, CatalogReranker } from '../domain/ai/interfaces';
import { CatalogRepository } from '../infra/repositories/catalog.repository';
import { MatchBand } from '../domain/ai/schemas';

describe('Search Pipeline Logic', () => {
    let service: ImageSearchService;
    let mockVision: any;
    let mockRepo: any;
    let mockReranker: any;
    let mockScorer: HeuristicScorer;
    let mockConfig: AppConfigService;
    let mockTelemetry: TelemetryService;

    beforeEach(() => {
        mockVision = {
            extractSignals: vi.fn().mockResolvedValue({
                categoryGuess: { value: 'Chair', confidence: 0.9 },
                typeGuess: { value: 'Dining Chair', confidence: 0.8 },
                attributes: { style: ['Modern'], material: ['Wood'], color: ['Black'], shape: ['Square'] },
                keywords: ['luxury', 'minimalist'],
                qualityFlags: { isFurnitureLikely: true, multipleObjects: false, lowImageQuality: false, occludedOrPartial: false, lowConfidence: false },
                intent: { priceMax: 500 }
            })
        };

        mockRepo = {
            findCandidates: vi.fn().mockResolvedValue([
                { _id: '1', title: 'Black Wood Chair', category: 'Chair', type: 'Dining Chair', price: 300, description: 'Modern chair', width: 50, height: 90, depth: 50 },
                { _id: '2', title: 'Luxury Sofa', category: 'Sofa', type: 'Sofa', price: 1200, description: 'Rich sofa', width: 200, height: 80, depth: 90 }
            ])
        };

        mockReranker = {
            rerank: vi.fn().mockResolvedValue({
                rankedIds: ['1', '2'],
                reasons: { '1': 'Matches everything' }
            })
        };

        mockScorer = new HeuristicScorer();
        mockConfig = AppConfigService.getInstance();
        mockTelemetry = { record: vi.fn(), getEvents: vi.fn().mockReturnValue([]) } as any;

        service = new ImageSearchService(
            mockVision as VisionSignalExtractor,
            mockRepo as CatalogRepository,
            mockReranker as CatalogReranker,
            mockScorer,
            mockConfig,
            mockTelemetry,
            { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any
        );
    });

    it('should complete the full pipeline successfully', async () => {
        const response = await service.searchByImage(
            Buffer.from('dummy-image'),
            'image/jpeg',
            'test-key',
            'test-req-1'
        );

        expect(response.results.length).toBeGreaterThan(0);
        expect(response.results[0].id).toBe('1');
        expect(response.results[0].reasons).toContain('Category match');
        expect(response.meta.requestId).toBe('test-req-1');
        expect(mockVision.extractSignals).toHaveBeenCalled();
        expect(mockReranker.rerank).toHaveBeenCalled();
    });

    it('should fallback to heuristic if reranking fails', async () => {
        mockReranker.rerank.mockRejectedValue(new Error('AI Failed'));

        const response = await service.searchByImage(
            Buffer.from('dummy-image'),
            'image/jpeg',
            'test-key',
            'test-req-2'
        );

        expect(response.results.length).toBe(2);
        expect(response.meta.notices[0].code).toBe('RERANK_FAILED');
        // Still has results from heuristic
        expect(response.results[0].id).toBe('1');
    });

    it('should implement confidence-driven retrieval (broad search)', async () => {
        // Low confidence signals
        mockVision.extractSignals.mockResolvedValue({
            categoryGuess: { value: 'Something', confidence: 0.1 },
            typeGuess: { value: 'Unknown', confidence: 0.1 },
            attributes: { style: [], material: [], color: [], shape: [] },
            keywords: ['unknown'],
            qualityFlags: { isFurnitureLikely: true, multipleObjects: false, lowImageQuality: false, occludedOrPartial: false, lowConfidence: true }
        });

        await service.searchByImage(
            Buffer.from('dummy-image'),
            'image/jpeg',
            'test-key',
            'test-req-3'
        );

        // Should call repo with undefined category/type for broad search
        expect(mockRepo.findCandidates).toHaveBeenCalledWith(expect.objectContaining({
            category: undefined,
            type: undefined
        }));
    });
});
