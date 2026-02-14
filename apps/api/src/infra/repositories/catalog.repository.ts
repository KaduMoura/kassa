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
        const limit = criteria.limit || 50;
        const minCandidates = 5;

        let currentBest: Product[] = [];

        // Plan A: Strict Category + Keywords
        if (criteria.category && criteria.keywords?.length) {
            currentBest = await this.executePlanA(criteria, limit);
            if (currentBest.length >= minCandidates) return currentBest;
        }

        // Plan B: Category / Type matching
        if (criteria.category) {
            const results = await this.executePlanB(criteria, limit);
            if (results.length >= minCandidates) return results;
            if (results.length > currentBest.length) currentBest = results;
        }

        // Plan C: Broad Keyword Search
        const finalResults = await this.executePlanC(criteria, limit);
        if (finalResults.length >= minCandidates || finalResults.length >= currentBest.length) {
            return finalResults;
        }

        return currentBest;
    }

    private async executePlanA(criteria: SearchCriteria, limit: number): Promise<Product[]> {
        const query: Filter<Product> = {
            category: criteria.category,
            $or: criteria.keywords?.map(kw => ({
                $or: [
                    { title: { $regex: kw, $options: 'i' } },
                    { description: { $regex: kw, $options: 'i' } }
                ]
            })) || []
        };

        return this.collection.find(query).limit(limit).toArray();
    }

    private async executePlanB(criteria: SearchCriteria, limit: number): Promise<Product[]> {
        const query: Filter<Product> = {
            $or: [
                { category: criteria.category },
                { type: criteria.type }
            ].filter(Boolean) as Filter<Product>[]
        };

        return this.collection.find(query).limit(limit).toArray();
    }

    private async executePlanC(criteria: SearchCriteria, limit: number): Promise<Product[]> {
        if (!criteria.keywords?.length) {
            return this.collection.find({}).limit(limit).toArray();
        }

        const query: Filter<Product> = {
            $or: criteria.keywords.map(kw => ({
                $or: [
                    { title: { $regex: kw, $options: 'i' } },
                    { description: { $regex: kw, $options: 'i' } }
                ]
            }))
        };

        return this.collection.find(query).limit(limit).toArray();
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
