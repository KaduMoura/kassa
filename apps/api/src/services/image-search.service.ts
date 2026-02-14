import { VisionSignalExtractor } from '../domain/ai/interfaces';
import { ImageSignals } from '../domain/ai/schemas';
import { CatalogRepository } from '../infra/repositories/catalog.repository';

export class ImageSearchService {
    constructor(
        private readonly visionExtractor: VisionSignalExtractor,
        private readonly catalogRepository: CatalogRepository
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
     * Complete Search Pipeline (to be implemented)
     */
    async searchByImage(
        imageBytes: Buffer,
        mimeType: string,
        apiKey: string,
        requestId: string,
        userPrompt?: string
    ) {
        // 1. Extract Signals
        const signals = await this.extractSignals(imageBytes, mimeType, apiKey, requestId, userPrompt);

        // 2. Initial Retrieval
        const candidates = await this.catalogRepository.findCandidates({
            category: signals.categoryGuess.value,
            keywords: signals.keywords,
        });

        // 3. (Stage 2) Reranking - coming next

        return {
            signals,
            candidates,
        };
    }
}
