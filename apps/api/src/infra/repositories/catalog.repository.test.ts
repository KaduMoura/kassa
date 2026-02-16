import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CatalogRepository } from './catalog.repository';
import * as dbModule from '../db';
import { ObjectId } from 'mongodb';

vi.mock('../db', () => ({
    getDb: vi.fn(),
}));

describe('CatalogRepository', () => {
    let repository: CatalogRepository;
    let mockCollection: any;
    let mockCursor: any;

    beforeEach(() => {
        vi.clearAllMocks();

        mockCursor = {
            sort: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            toArray: vi.fn().mockResolvedValue([]),
        };

        mockCollection = {
            find: vi.fn().mockReturnValue(mockCursor),
            findOne: vi.fn().mockResolvedValue(null),
        };

        (dbModule.getDb as any).mockReturnValue({
            collection: vi.fn().mockReturnValue(mockCollection),
        });

        repository = new CatalogRepository();
    });

    it('should execute Plan A ($text + full filters) when all criteria present', async () => {
        // Step 1: executeTextQuery
        mockCursor.toArray.mockResolvedValueOnce([
            { _id: new ObjectId(), title: 'Product A', description: 'desc', category: 'furniture', type: 'chair', price: 100, width: 1, height: 1, depth: 1 }
        ]);

        const { products, plan } = await repository.findCandidates({
            category: 'furniture',
            type: 'chair',
            keywords: ['wood'],
            priceMax: 500,
            minCandidates: 1
        });

        expect(products).toHaveLength(1);
        expect(plan).toBe('A');
    });

    it('should fallback to Plan B (drop type) if Plan A returns too few results', async () => {
        // Step 1: Plan A returns 0
        mockCursor.toArray.mockResolvedValueOnce([]);
        // Step 2: Plan B returns 12
        mockCursor.toArray.mockResolvedValueOnce(new Array(12).fill({
            _id: new ObjectId(), title: 'B', description: 'desc', category: 'furniture', type: 'chair', price: 100, width: 1, height: 1, depth: 1
        }));

        const { products, plan } = await repository.findCandidates({
            category: 'furniture',
            type: 'chair',
            keywords: ['wood'],
            minCandidates: 10
        });

        expect(products).toHaveLength(12);
        expect(plan).toBe('B');
    });

    it('should apply numeric filters correctly for dimensions (Ladder Step 3)', async () => {
        // Step 1 (A): returns 0
        mockCursor.toArray.mockResolvedValueOnce([]);
        // Step 2 (B): returns 0 (keywords present, category present, priceMin undefined) 
        // Ladder Step 2 condition: if (criteria.keywords?.length && (criteria.category || criteria.priceMin))
        mockCursor.toArray.mockResolvedValueOnce([]);
        // Step 3 (TEXT): returns results
        mockCursor.toArray.mockResolvedValueOnce([
            { _id: new ObjectId(), title: 'C', description: 'desc', category: 'cat', type: 'type', price: 10, width: 1, height: 1, depth: 1 }
        ]);

        const { plan } = await repository.findCandidates({
            category: 'cat', // Ensure Step 2 is called
            keywords: ['wood'],
            widthMin: 100,
            widthMax: 200,
            minCandidates: 1
        });

        expect(plan).toBe('TEXT');
    });

    it('should fallback to regex Plan D if category/type exists but no keywords', async () => {
        // Step 1, 2, 3: Skipped (no keywords)
        // Step 4: executeRegexQuery
        mockCursor.toArray.mockResolvedValueOnce([
            { _id: new ObjectId(), title: 'D', description: 'desc', category: 'furniture', type: 'chair', price: 10, width: 1, height: 1, depth: 1 }
        ]);

        const { products, plan } = await repository.findCandidates({
            category: 'furniture',
            type: 'chair',
            minCandidates: 1
        });

        expect(products).toHaveLength(1);
        expect(plan).toBe('D');
    });

    describe('findById', () => {
        it('should call findOne with ObjectId', async () => {
            const id = '507f1f77bcf86cd799439011';
            await repository.findById(id);
            expect(mockCollection.findOne).toHaveBeenCalledWith(expect.objectContaining({
                _id: expect.any(Object)
            }));
        });
    });
});
