import { VisionSignalExtractor, CatalogReranker } from '../domain/ai/interfaces';
import { ImageSignals, CandidateSummary } from '../domain/ai/schemas';
import { CatalogRepository } from '../infra/repositories/catalog.repository';
import { Product } from '../domain/product';

export interface Logger {
    info(msg: string, ...args: any[]): void;
    error(msg: string, ...args: any[]): void;
    warn(msg: string, ...args: any[]): void;
}

export class ImageSearchService {
    constructor(
        private readonly visionExtractor: VisionSignalExtractor,
        private readonly catalogRepository: CatalogRepository,
        private readonly reranker: CatalogReranker,
        private readonly logger?: Logger
    ) { }

    /**
     * Stage 1: Extract signals from image
     */
    async extractSignals(
        imageBytes: Buffer,
        mimeType: string,
        apiKey: string,
        requestId: string,
        userPrompt?: string
    ): Promise<ImageSignals> {
        return this.visionExtractor.extractSignals({
            imageBytes,
            mimeType,
            prompt: userPrompt,
            apiKey,
            requestId,
        });
    }

    /**
     * Complete Search Pipeline
     */
    async searchByImage(
        imageBytes: Buffer,
        mimeType: string,
        apiKey: string,
        requestId: string,
        userPrompt?: string
    ): Promise<{ signals: ImageSignals; candidates: Product[] }> {
        // 1. Extract Signals (Stage 1)
        const signals = await this.extractSignals(imageBytes, mimeType, apiKey, requestId, userPrompt);

        // 2. Initial Retrieval (Heuristic)
        const initialCandidates = await this.catalogRepository.findCandidates({
            category: signals.categoryGuess.value,
            keywords: signals.keywords,
        });

        if (initialCandidates.length === 0) {
            return { signals, candidates: [] };
        }

        // 3. Reranking (Stage 2)
        try {
            const candidateSummaries: CandidateSummary[] = initialCandidates.map(c => ({
                id: c._id?.toString() || c.title, // Fallback to title if _id missing
                title: c.title,
                category: c.category,
                type: c.type,
                price: c.price,
                description: c.description,
            }));

            const rerankResult = await this.reranker.rerank({
                signals,
                candidates: candidateSummaries,
                prompt: userPrompt,
                apiKey,
                requestId,
            });

            // Map and reorder
            const candidateMap = new Map(initialCandidates.map(c => [c._id?.toString() || c.title, c]));
            const rerankedCandidates = rerankResult.rankedIds
                .map(id => candidateMap.get(id))
                .filter((c): c is Product => !!c);

            return {
                signals,
                candidates: rerankedCandidates,
            };
        } catch (error) {
            this.logger?.error(`[ImageSearchService] Reranking failed for request ${requestId}, falling back to heuristic order:`, error);
            // Fallback to initialOrder if Stage 2 fails
            return {
                signals,
                candidates: initialCandidates,
            };
        }
    }
}
