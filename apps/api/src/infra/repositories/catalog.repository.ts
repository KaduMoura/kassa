import { Collection, Filter, ObjectId } from 'mongodb';
import { Product, SearchCriteria, ProductSchema } from '../../domain/product';
import { RetrievalPlan } from '../../domain/ai/schemas';
import { getDb } from '../db';

export class CatalogRepository {
    private collection: Collection<Product>;

    constructor() {
        this.collection = getDb().collection<Product>('products');
    }

    /**
     * Main candidate retrieval logic with relaxation ladder.
     * Uses $text search as primary + numeric filters.
     */
    async findCandidates(criteria: SearchCriteria): Promise<{ products: Product[], plan: RetrievalPlan }> {
        const limit = criteria.limit || 60;
        const minCandidates = criteria.minCandidates || 10;

        // Ladder Step 1: $text + category + type + price/dims
        if (criteria.keywords?.length) {
            try {
                const results = await this.executeTextQuery(criteria, limit, {
                    includeCategory: true,
                    includeType: true,
                    includeNumeric: true
                });
                if (results.length >= minCandidates) return { products: results, plan: 'A' as any };
            } catch (error) {
                console.warn('[CatalogRepository] Text query failed, falling back to regex ladder', error);
            }
        }

        // Ladder Step 2: $text + category + price/dims (dropped type)
        if (criteria.keywords?.length && (criteria.category || criteria.priceMin)) {
            const results = await this.executeTextQuery(criteria, limit, {
                includeCategory: true,
                includeType: false,
                includeNumeric: true
            });
            if (results.length >= minCandidates) return { products: results, plan: 'B' as any };
        }

        // Ladder Step 3: $text + price/dims (dropped category)
        if (criteria.keywords?.length) {
            const results = await this.executeTextQuery(criteria, limit, {
                includeCategory: false,
                includeType: false,
                includeNumeric: true
            });
            if (results.length >= minCandidates) return { products: results, plan: 'TEXT' as any };
        }

        // Ladder Step 4: Category + Type (no text)
        if (criteria.category || criteria.type) {
            const results = await this.executeRegexQuery(criteria, limit, {
                includeText: false,
                includeCategory: true,
                includeType: true,
                includeNumeric: false
            });
            if (results.length >= minCandidates) return { products: results, plan: 'D' as any };
        }

        // Ladder Step 5: Keywords only (last resort for text)
        if (criteria.keywords?.length) {
            const results = await this.executeTextQuery(criteria, limit, {
                includeCategory: false,
                includeType: false,
                includeNumeric: false
            });
            return { products: results, plan: 'C' as any };
        }

        return { products: [], plan: 'D' as any };
    }

    private async executeTextQuery(
        criteria: SearchCriteria,
        limit: number,
        options: { includeCategory: boolean, includeType: boolean, includeNumeric: boolean }
    ): Promise<Product[]> {
        const query: Filter<Product> = {
            $text: { $search: criteria.keywords!.join(' ') }
        };

        if (options.includeCategory && criteria.category) {
            query.category = criteria.category;
        }
        if (options.includeType && criteria.type) {
            query.type = criteria.type;
        }
        if (options.includeNumeric) {
            Object.assign(query, this.buildNumericFilters(criteria));
        }

        const docs = await this.collection.find(query, {
            projection: { ...this.getProjection(), score: { $meta: 'textScore' } }
        })
            .sort({ score: { $meta: 'textScore' } })
            .limit(limit)
            .toArray();

        return this.validateAndParse(docs);
    }

    private async executeRegexQuery(
        criteria: SearchCriteria,
        limit: number,
        options: { includeText: boolean, includeCategory: boolean, includeType: boolean, includeNumeric: boolean }
    ): Promise<Product[]> {
        const query: Filter<Product> = {};

        if (options.includeCategory && criteria.category) {
            query.category = criteria.category;
        }
        if (options.includeType && criteria.type) {
            query.type = criteria.type;
        }
        if (options.includeNumeric) {
            Object.assign(query, this.buildNumericFilters(criteria));
        }

        if (options.includeText && criteria.keywords?.length) {
            query.$or = criteria.keywords.map(kw => ({
                $or: [
                    { title: { $regex: kw, $options: 'i' } },
                    { description: { $regex: kw, $options: 'i' } }
                ]
            }));
        }

        const docs = await this.collection.find(query, { projection: this.getProjection() }).limit(limit).toArray();
        return this.validateAndParse(docs);
    }

    private buildNumericFilters(criteria: SearchCriteria): Filter<Product> {
        const filters: any = {};

        if (criteria.priceMin !== undefined || criteria.priceMax !== undefined) {
            filters.price = {};
            if (criteria.priceMin !== undefined) filters.price.$gte = criteria.priceMin;
            if (criteria.priceMax !== undefined) filters.price.$lte = criteria.priceMax;
        }

        const dimFields = ['width', 'height', 'depth'] as const;
        for (const field of dimFields) {
            const minKey = `${field}Min` as keyof SearchCriteria;
            const maxKey = `${field}Max` as keyof SearchCriteria;

            if (criteria[minKey] !== undefined || criteria[maxKey] !== undefined) {
                filters[field] = {};
                if (criteria[minKey] !== undefined) filters[field].$gte = criteria[minKey];
                if (criteria[maxKey] !== undefined) filters[field].$lte = criteria[maxKey];
            }
        }

        return filters;
    }

    private async validateAndParse(docs: any[]): Promise<Product[]> {
        const validProducts: Product[] = [];
        for (const doc of docs) {
            const result = ProductSchema.safeParse(doc);
            if (result.success) {
                validProducts.push(result.data);
            } else {
                console.warn(`[CatalogRepository] Discarding invalid product document ${doc._id}:`, result.error.format());
            }
        }
        return validProducts;
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

    async findById(id: string): Promise<Product | null> {
        try {
            return this.collection.findOne({ _id: new ObjectId(id) } as any);
        } catch {
            return null;
        }
    }

    async findByTitle(title: string): Promise<Product | null> {
        return this.collection.findOne({ title: title } as any);
    }

    async getSample(): Promise<Product | null> {
        return this.collection.findOne({});
    }
}
