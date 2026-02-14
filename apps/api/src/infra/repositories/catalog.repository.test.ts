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

    it('should execute Plan A when category, type, and keywords are present', async () => {
        mockCollection.toArray.mockResolvedValueOnce([{ title: 'Product A' }, { title: 'A2' }, { title: 'A3' }, { title: 'A4' }, { title: 'A5' }]);

        const results = await repository.findCandidates({
            category: 'furniture',
            type: 'chair',
            keywords: ['wood']
        });

        expect(results).toHaveLength(5);
        expect(mockCollection.find).toHaveBeenCalledWith(
            expect.objectContaining({
                category: 'furniture',
                type: 'chair',
                $or: expect.any(Array)
            }),
            expect.objectContaining({ projection: expect.any(Object) })
        );
    });

    it('should fallback to Plan B if Plan A returns too few results', async () => {
        // Plan A returns 1 (below threshold of 5)
        mockCollection.toArray.mockResolvedValueOnce([{ title: 'A' }]);
        // Plan B returns 6 (satisfies threshold)
        mockCollection.toArray.mockResolvedValueOnce(new Array(6).fill({ title: 'B' }));

        const results = await repository.findCandidates({
            category: 'furniture',
            type: 'chair',
            keywords: ['wood']
        });

        expect(results).toHaveLength(6);
        // Second call should be Plan B (category + keywords, no type)
        expect(mockCollection.find).toHaveBeenNthCalledWith(2,
            expect.objectContaining({
                category: 'furniture',
                $or: expect.any(Array)
            }),
            expect.objectContaining({ projection: expect.any(Object) })
        );
    });

    it('should execute Plan C if no category/type provided but keywords exist', async () => {
        mockCollection.toArray.mockResolvedValue([{ title: 'Product C' }]);

        const results = await repository.findCandidates({
            keywords: ['chair']
        });

        expect(results).toHaveLength(1);
        expect(mockCollection.find).toHaveBeenCalledWith(
            expect.objectContaining({
                $or: expect.any(Array)
            }),
            expect.objectContaining({ projection: expect.any(Object) })
        );
    });

    it('should execute Plan D as last resort if category/type exist but keywords found nothing', async () => {
        // Plan A, B, C all empty
        mockCollection.toArray.mockResolvedValueOnce([]);
        mockCollection.toArray.mockResolvedValueOnce([]);
        mockCollection.toArray.mockResolvedValueOnce([]);
        // Plan D returns something
        mockCollection.toArray.mockResolvedValueOnce([{ title: 'D' }]);

        const results = await repository.findCandidates({
            category: 'furniture',
            type: 'chair',
            keywords: ['nonexistent']
        });

        expect(results).toHaveLength(1);
        expect(mockCollection.find).toHaveBeenLastCalledWith(
            {
                $or: [
                    { category: 'furniture' },
                    { type: 'chair' }
                ]
            },
            expect.objectContaining({ projection: expect.any(Object) })
        );
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
