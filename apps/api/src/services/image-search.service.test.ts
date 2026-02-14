import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ImageSearchService } from './image-search.service';
import { VisionSignalExtractor, CatalogReranker } from '../domain/ai/interfaces';
import { CatalogRepository } from '../infra/repositories/catalog.repository';
import { TelemetryService } from './telemetry.service';
import { ImageSignals, MatchBand } from '../domain/ai/schemas';
import { Product } from '../domain/product';
import { ObjectId } from 'mongodb';
import { HeuristicScorer } from '../domain/ranking/heuristic-scorer';
import { AppConfigService } from '../config/app-config.service';
import { DEFAULT_ADMIN_CONFIG } from '../domain/config.schema';

describe('ImageSearchService', () => {
    let service: ImageSearchService;
    let mockVision: VisionSignalExtractor;
    let mockRepo: CatalogRepository;
    let mockReranker: CatalogReranker;
    let mockTelemetry: TelemetryService;
    let mockScorer: HeuristicScorer;
    let mockConfig: AppConfigService;

    const mockSignals: ImageSignals = {
        categoryGuess: { value: 'furniture', confidence: 0.9 },
        typeGuess: { value: 'sofa', confidence: 0.8 },
        attributes: { style: ['modern'], material: ['fabric'], color: ['grey'], shape: ['L-shape'] },
        keywords: ['grey sofa', 'modern couch'],
        qualityFlags: { isFurnitureLikely: true, multipleObjects: false, lowImageQuality: false, occludedOrPartial: false, lowConfidence: false }
    };

    const mockProducts: Product[] = [
        { _id: new ObjectId('507f1f77bcf86cd799439011'), title: 'Sofa 1', description: 'desc 1', category: 'furniture', type: 'sofa', price: 100, width: 1, height: 1, depth: 1 },
        { _id: new ObjectId('507f1f77bcf86cd799439012'), title: 'Sofa 2', description: 'desc 2', category: 'furniture', type: 'sofa', price: 200, width: 1, height: 1, depth: 1 },
    ];

    beforeEach(() => {
        mockVision = {
            extractSignals: vi.fn()
        };
        mockRepo = {
            findCandidates: vi.fn(),
            findById: vi.fn(),
            getSample: vi.fn(),
        } as unknown as CatalogRepository;
        mockReranker = {
            rerank: vi.fn()
        };
        mockTelemetry = {
            record: vi.fn(),
            getEvents: vi.fn(),
            clear: vi.fn()
        } as unknown as TelemetryService;
        mockScorer = new HeuristicScorer();
        mockConfig = {
            getConfig: vi.fn().mockReturnValue(DEFAULT_ADMIN_CONFIG)
        } as unknown as AppConfigService;

        service = new ImageSearchService(
            mockVision,
            mockRepo,
            mockReranker,
            mockScorer,
            mockConfig,
            mockTelemetry
        );
    });

    describe('searchByImage', () => {
        it('should complete full pipeline successfully', async () => {
            vi.mocked(mockVision.extractSignals).mockResolvedValue(mockSignals);
            vi.mocked(mockRepo.findCandidates).mockResolvedValue(mockProducts);
            vi.mocked(mockReranker.rerank).mockResolvedValue({
                rankedIds: ['507f1f77bcf86cd799439012', '507f1f77bcf86cd799439011'],
                reasons: { '507f1f77bcf86cd799439012': ['better match'] }
            });

            const result = await service.searchByImage(Buffer.from(''), 'image/jpeg', 'key', 'req1');

            expect(result.query.signals).toEqual(mockSignals);
            expect(result.results).toHaveLength(2);
            expect(result.results[0].id).toBe('507f1f77bcf86cd799439012');
            expect(result.results[1].id).toBe('507f1f77bcf86cd799439011');
            expect(mockTelemetry.record).toHaveBeenCalled();
        });

        it('should return empty results if repository finds nothing', async () => {
            vi.mocked(mockVision.extractSignals).mockResolvedValue(mockSignals);
            vi.mocked(mockRepo.findCandidates).mockResolvedValue([]);

            const result = await service.searchByImage(Buffer.from(''), 'image/jpeg', 'key', 'req1');

            expect(result.results).toHaveLength(0);
            expect(mockReranker.rerank).not.toHaveBeenCalled();
            expect(mockTelemetry.record).toHaveBeenCalled();
        });

        it('should fallback to heuristic order if reranking fails', async () => {
            vi.mocked(mockVision.extractSignals).mockResolvedValue(mockSignals);
            vi.mocked(mockRepo.findCandidates).mockResolvedValue(mockProducts);
            vi.mocked(mockReranker.rerank).mockRejectedValue(new Error('AI Failed'));

            const result = await service.searchByImage(Buffer.from(''), 'image/jpeg', 'key', 'req1');

            expect(result.results).toHaveLength(2);
            // HeuristicScorer will score them, Sofa 1 comes first in repo
            expect(result.results[0].title).toBe('Sofa 1');
            expect(result.meta.notices).toContainEqual(expect.objectContaining({ code: 'RERANK_FAILED' }));
            expect(mockTelemetry.record).toHaveBeenCalled();
        });
    });
});
