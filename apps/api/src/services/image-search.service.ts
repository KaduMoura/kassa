import { VisionSignalExtractor, CatalogReranker } from '../domain/ai/interfaces';
import { ImageSignals, CandidateSummary, SearchResponse, ScoredCandidate, SearchTimings, SearchNotice } from '../domain/ai/schemas';
import { CatalogRepository } from '../infra/repositories/catalog.repository';
import { Product } from '../domain/product';
import { HeuristicScorer } from '../domain/ranking/heuristic-scorer';
import { AppConfigService } from '../config/app-config.service';

export interface Logger {
    info(msg: string, ...args: unknown[]): void;
    error(msg: string, ...args: unknown[]): void;
    warn(msg: string, ...args: unknown[]): void;
}

export class ImageSearchService {
    constructor(
        private readonly visionExtractor: VisionSignalExtractor,
        private readonly catalogRepository: CatalogRepository,
        private readonly reranker: CatalogReranker,
        private readonly heuristicScorer: HeuristicScorer,
        private readonly configService: AppConfigService,
        private readonly logger?: Logger
    ) { }

    /**
     * Complete Search Pipeline
     */
    async searchByImage(
        imageBytes: Buffer,
        mimeType: string,
        apiKey: string,
        requestId: string,
        userPrompt?: string
    ): Promise<SearchResponse> {
        const startTime = Date.now();
        const timings: SearchTimings = {
            totalMs: 0,
            stage1Ms: 0,
            mongoMs: 0,
            stage2Ms: 0
        };
        const notices: SearchNotice[] = [];
        const config = this.configService.getConfig();

        // 1. Extract Signals (Stage 1)
        const s1Start = Date.now();
        const signals = await this.visionExtractor.extractSignals({
            imageBytes,
            mimeType,
            prompt: userPrompt,
            apiKey,
            requestId,
        });
        timings.stage1Ms = Date.now() - s1Start;

        // 2. Initial Retrieval (Heuristic)
        const mongoStart = Date.now();
        const initialCandidates = await this.catalogRepository.findCandidates({
            category: signals.categoryGuess.value,
            keywords: signals.keywords,
            limit: config.candidateTopN
        });
        timings.mongoMs = Date.now() - mongoStart;

        if (initialCandidates.length === 0) {
            timings.totalMs = Date.now() - startTime;
            return {
                query: { prompt: userPrompt, signals },
                results: [],
                meta: { requestId, timings, notices }
            };
        }

        // 3. Heuristic Pre-Ranking (Stage 1.5)
        const candidateSummaries: CandidateSummary[] = initialCandidates.map(c => ({
            id: c._id?.toString() || c.title,
            title: c.title,
            category: c.category,
            type: c.type,
            price: c.price,
            description: c.description,
        }));

        let scoredCandidates: ScoredCandidate[] = candidateSummaries.map(c =>
            this.heuristicScorer.score(c, signals, config)
        );

        // Sort by heuristic score
        scoredCandidates.sort((a, b) => b.score - a.score);

        // 4. Reranking (Stage 2)
        if (config.enableLLMRerank) {
            const s2Start = Date.now();
            try {
                // Only send top M candidates to LLM
                const topCandidates = scoredCandidates.slice(0, config.llmRerankTopM);

                const rerankResult = await this.reranker.rerank({
                    signals,
                    candidates: topCandidates,
                    prompt: userPrompt,
                    apiKey,
                    requestId,
                });

                // Map and reorder
                const candidateMap = new Map(scoredCandidates.map(c => [c.id, c]));
                const rerankedCandidates = rerankResult.rankedIds
                    .map(id => candidateMap.get(id))
                    .filter((c): c is ScoredCandidate => !!c);

                // Combine reranked with remaining heuristic candidates if needed
                const rerankedIds = new Set(rerankResult.rankedIds);
                const remaining = scoredCandidates.filter(c => !rerankedIds.has(c.id));

                scoredCandidates = [...rerankedCandidates, ...remaining];
                timings.stage2Ms = Date.now() - s2Start;
            } catch (error) {
                this.logger?.error(`[ImageSearchService] Reranking failed for request ${requestId}, falling back to heuristic order:`, error);
                notices.push({ code: 'RERANK_FAILED', message: 'Falling back to heuristic ranking.' });
                timings.stage2Ms = Date.now() - s2Start;
            }
        } else {
            notices.push({ code: 'RERANK_DISABLED', message: 'Stage 2 reranking is disabled.' });
        }

        timings.totalMs = Date.now() - startTime;

        return {
            query: { prompt: userPrompt, signals },
            results: scoredCandidates.slice(0, config.rerankOutputK),
            meta: {
                requestId,
                timings,
                notices
            }
        };
    }
}
