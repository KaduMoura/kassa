import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CatalogRepository } from './catalog.repository';
import * as dbModule from '../db';
import { Collection } from 'mongodb';

vi.mock('../db', () => ({
    getDb: vi.fn(),
}));

describe('CatalogRepository', () => {
    let repository: CatalogRepository;
    let mockCollection: any;

    beforeEach(() => {
        mockCollection = {
            find: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            toArray: vi.fn().mockResolvedValue([]),
            findOne: vi.fn().mockResolvedValue(null),
        };

        (dbModule.getDb as any).mockReturnValue({
            collection: vi.fn().mockReturnValue(mockCollection),
        });

        repository = new CatalogRepository();
    });

    it('should execute Plan A when category and keywords are present', async () => {
        mockCollection.toArray.mockResolvedValueOnce([{ title: 'Product A' }]);

        const results = await repository.findCandidates({
            category: 'furniture',
            keywords: ['sofa']
        });

        expect(results).toHaveLength(1);
        expect(mockCollection.find).toHaveBeenCalledWith(expect.objectContaining({
            category: 'furniture',
            $or: expect.any(Array)
        }));
    });

    it('should fallback to Plan B and then C if results are below threshold', async () => {
        // Plan A returns 0
        mockCollection.toArray.mockResolvedValueOnce([]);
        // Plan B returns 1 (below threshold of 5)
        mockCollection.toArray.mockResolvedValueOnce([{ title: 'Product B' }]);
        // Plan C returns 2 (better than B, still below threshold but best so far)
        mockCollection.toArray.mockResolvedValueOnce([{ title: 'Product C1' }, { title: 'Product C2' }]);

        const results = await repository.findCandidates({
            category: 'furniture',
            keywords: ['sofa']
        });

        expect(results).toHaveLength(2);
        expect(results[0].title).toBe('Product C1');
    });

    it('should execute Plan C if no category is provided', async () => {
        mockCollection.toArray.mockResolvedValue([{ title: 'Product C' }]);

        const results = await repository.findCandidates({
            keywords: ['chair']
        });

        expect(results).toHaveLength(1);
        expect(mockCollection.find).toHaveBeenCalledWith(expect.objectContaining({
            $or: expect.any(Array)
        }));
    });

    describe('findById', () => {
        it('should call findOne with ObjectId', async () => {
            const id = '507f1f77bcf86cd799439011';
            await repository.findById(id);
            expect(mockCollection.findOne).toHaveBeenCalledWith(expect.objectContaining({
                _id: expect.any(Object)
            }));
        });

        it('should return null for invalid ObjectId', async () => {
            const result = await repository.findById('invalid');
            expect(result).toBeNull();
            expect(mockCollection.findOne).not.toHaveBeenCalled();
        });
    });

    describe('findByTitle', () => {
        it('should call findOne with title', async () => {
            await repository.findByTitle('My Product');
            expect(mockCollection.findOne).toHaveBeenCalledWith({ title: 'My Product' });
        });
    });
});
