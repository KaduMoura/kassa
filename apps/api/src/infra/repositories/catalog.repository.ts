import { Db, Collection, Filter, ObjectId } from 'mongodb';
import { Product, SearchCriteria } from '../../domain/product';
import { getDb } from '../db';

export class CatalogRepository {
    private collection: Collection<Product>;

    constructor() {
        this.collection = getDb().collection<Product>('products');
    }

    /**
     * Main candidate retrieval logic with relaxation ladder.
     */
    async findCandidates(criteria: SearchCriteria): Promise<Product[]> {
        const limit = criteria.limit || 60;
        const minCandidates = criteria.minCandidates || 10;

        // Keep track of best results so far
        let lastResults: Product[] = [];

        // Plan A: Category + Type + Keywords (High Precision)
        if (criteria.category && criteria.type && criteria.keywords?.length) {
            lastResults = await this.executePlanA(criteria, limit);
            if (lastResults.length >= minCandidates) return lastResults;
        }

        // Plan B: Category + Keywords (Balanced)
        if (criteria.category && criteria.keywords?.length) {
            const results = await this.executePlanB(criteria, limit);
            if (results.length >= minCandidates) return results;
            if (results.length > lastResults.length) lastResults = results;
        }

        // Plan C: Broad Keyword Search (Recall focus)
        if (criteria.keywords?.length) {
            const results = await this.executePlanC(criteria, limit);
            if (results.length >= minCandidates) return results;
            if (results.length > lastResults.length) lastResults = results;
        }

        // Plan D: Category + Type matching (Fallback)
        if (criteria.category || criteria.type) {
            const results = await this.executePlanD(criteria, limit);
            if (results.length >= minCandidates) return results;
            if (results.length > lastResults.length) lastResults = results;
        }

        return lastResults;
    }

    private getProjection() {
        return {
            _id: 1,
            title: 1,
            description: 1,
            category: 1,
            type: 1,
            price: 1,
            width: 1,
            height: 1,
            depth: 1
        };
    }

    private async executePlanA(criteria: SearchCriteria, limit: number): Promise<Product[]> {
        const query: Filter<Product> = {
            category: criteria.category,
            type: criteria.type,
            $or: criteria.keywords?.map(kw => ({
                $or: [
                    { title: { $regex: kw, $options: 'i' } },
                    { description: { $regex: kw, $options: 'i' } }
                ]
            })) || []
        };

        return this.collection.find(query, { projection: this.getProjection() }).limit(limit).toArray();
    }

    private async executePlanB(criteria: SearchCriteria, limit: number): Promise<Product[]> {
        const query: Filter<Product> = {
            category: criteria.category,
            $or: criteria.keywords?.map(kw => ({
                $or: [
                    { title: { $regex: kw, $options: 'i' } },
                    { description: { $regex: kw, $options: 'i' } }
                ]
            })) || []
        };

        return this.collection.find(query, { projection: this.getProjection() }).limit(limit).toArray();
    }

    private async executePlanC(criteria: SearchCriteria, limit: number): Promise<Product[]> {
        if (!criteria.keywords?.length) return [];

        const query: Filter<Product> = {
            $or: criteria.keywords.map(kw => ({
                $or: [
                    { title: { $regex: kw, $options: 'i' } },
                    { description: { $regex: kw, $options: 'i' } }
                ]
            }))
        };

        return this.collection.find(query, { projection: this.getProjection() }).limit(limit).toArray();
    }

    private async executePlanD(criteria: SearchCriteria, limit: number): Promise<Product[]> {
        const filters: Filter<Product>[] = [];
        if (criteria.category) filters.push({ category: criteria.category });
        if (criteria.type) filters.push({ type: criteria.type });

        if (filters.length === 0) return [];

        const query: Filter<Product> = { $or: filters };

        return this.collection.find(query, { projection: this.getProjection() }).limit(limit).toArray();
    }

    async findById(id: string): Promise<Product | null> {
        try {
            return this.collection.findOne({ _id: new ObjectId(id) } as any);
        } catch {
            return null; // Invalid ObjectId
        }
    }

    async findByTitle(title: string): Promise<Product | null> {
        return this.collection.findOne({ title: title } as any);
    }

    async getSample(): Promise<Product | null> {
        return this.collection.findOne({});
    }
}
