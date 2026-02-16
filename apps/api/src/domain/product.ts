import { z } from 'zod';
import { ObjectId } from 'mongodb';

export const ProductSchema = z.object({
    _id: z.instanceof(ObjectId).optional(),
    title: z.string(),
    description: z.string(),
    category: z.string(),
    type: z.string(),
    price: z.number(),
    width: z.number().optional().default(0),
    height: z.number().optional().default(0),
    depth: z.number().optional().default(0),
});

export type Product = z.infer<typeof ProductSchema>;

export interface SearchCriteria {
    category?: string;
    type?: string;
    keywords?: string[];
    priceMin?: number;
    priceMax?: number;
    widthMin?: number;
    widthMax?: number;
    heightMin?: number;
    heightMax?: number;
    depthMin?: number;
    depthMax?: number;
    limit?: number;
    minCandidates?: number;
}
