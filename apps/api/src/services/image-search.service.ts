
import { VisionSignalExtractor, CatalogReranker } from '../domain/ai/interfaces';
import { ImageSignals, CandidateSummary, SearchResponse, ScoredCandidate, SearchTimings, SearchNotice, AiErrorCode } from '../domain/ai/schemas';
import { CatalogRepository } from '../infra/repositories/catalog.repository';
import { HeuristicScorer } from '../domain/ranking/heuristic-scorer';
import { AppConfigService } from '../config/app-config.service';
import { TelemetryService } from './telemetry.service';

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
        private readonly telemetryService: TelemetryService,
        private readonly logger?: Logger
    ) { }

    private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, stageName: string): Promise<T> {
        let timeoutHandle = setTimeout(() => { }, 0); // Initialize with dummy timeout
        const timeoutPromise = new Promise<never>((_, reject) => {
            clearTimeout(timeoutHandle); // Clear dummy immediately
            timeoutHandle = setTimeout(() => reject(new Error(`${stageName} timed out after ${timeoutMs} ms`)), timeoutMs);
        });

        try {
            return await Promise.race([promise, timeoutPromise]);
        } finally {
            clearTimeout(timeoutHandle);
        }
    }



    /**
     * Complete Search Pipeline
     */
    async searchByImage(
        imageBytes: Buffer,
        mimeType: string,
        apiKey: string,
        requestId: string,
        userPrompt?: string,
        clientContext?: Record<string, unknown>
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
        let signals: ImageSignals;
        try {
            signals = await this.withTimeout(
                this.visionExtractor.extractSignals({
                    imageBytes,
                    mimeType,
                    prompt: userPrompt,
                    apiKey,
                    requestId,
                    config: {
                        temperature: 0.1,
                        maxOutputTokens: 1000
                    }
                }),
                config.timeoutsMs.stage1,
                'Stage 1 (Vision)'
            );
        } catch (error) {
            this.logger?.error(`[ImageSearchService] Stage 1 failed for request ${requestId}: `, error);

            if (userPrompt) {
                this.logger?.warn(`[ImageSearchService] Falling back to text-only retrieval using prompt: "${userPrompt}"`);
                notices.push({
                    code: 'VISION_FALLBACK',
                    message: 'AI Vision failed. Falling back to text search based on your prompt.'
                });

                // Construct fallback signals based on user prompt
                signals = {
                    categoryGuess: { value: 'unknown', confidence: 0 },
                    typeGuess: { value: 'unknown', confidence: 0 },
                    attributes: { style: [], material: [], color: [], shape: [] },
                    keywords: [userPrompt],
                    qualityFlags: {
                        isFurnitureLikely: true,
                        multipleObjects: false,
                        lowImageQuality: false,
                        occludedOrPartial: false,
                        lowConfidence: true
                    }
                };
            } else {
                throw error; // No prompt to fallback on
            }
        }
        timings.stage1Ms = Date.now() - s1Start;

        // Add notices for low confidence
        if (signals.categoryGuess.confidence < config.minCategoryConfidence) {
            notices.push({ code: 'LOW_CONFIDENCE_CATEGORY', message: 'Low confidence in category identification.' });
        }
        if (signals.typeGuess.confidence < config.minTypeConfidence) {
            notices.push({ code: 'LOW_CONFIDENCE_TYPE', message: 'Low confidence in specific type identification.' });
        }

        // Initial Retrieval (Heuristic Plans)
        const mongoStart = Date.now();

        // Confidence-driven retrieval: use Plan D if confidence is too low OR if strict filter is disabled
        const useStrictFilters = config.useCategoryFilter && signals.categoryGuess.confidence >= config.minCategoryConfidence;

        const { products: initialCandidates, plan: retrievalPlan } = await this.catalogRepository.findCandidates({
            category: useStrictFilters ? signals.categoryGuess.value : undefined,
            type: useStrictFilters && signals.typeGuess.confidence >= config.minTypeConfidence ? signals.typeGuess.value : undefined,
            keywords: signals.keywords.slice(0, config.maxKeywordsForRetrieval),
            limit: config.candidateTopN,
            minCandidates: config.minCandidates
        });
        timings.mongoMs = Date.now() - mongoStart;

        if (initialCandidates.length === 0) {
            timings.totalMs = Date.now() - startTime;
            const response = {
                query: { prompt: userPrompt, signals },
                results: [],
                meta: { requestId, timings, notices, retrievalPlan }
            };

            this.logger?.info('[Search Summary] No candidates found', {
                requestId,
                timings,
                counts: { retrieved: 0, reranked: 0, returned: 0 },
                retrievalPlan
            });

            this.telemetryService.record({
                requestId,
                timings,
                counts: { retrieved: 0, reranked: 0, returned: 0 },
                fallbacks: { visionFallback: false, rerankFallback: false, broadRetrieval: false },
                retrievalPlan,
                error: null
            });

            return response;
        }

        // 3. Heuristic Pre-Ranking (Stage 1.5)
        const candidateSummaries: CandidateSummary[] = initialCandidates.map(c => ({
            id: c._id?.toString() || c.title,
            title: c.title,
            category: c.category,
            type: c.type,
            price: c.price,
            width: c.width,
            height: c.height,
            depth: c.depth,
            description: c.description.substring(0, config.maxDescriptionChars),
        }));

        let scoredCandidates: ScoredCandidate[] = candidateSummaries.map(c =>
            this.heuristicScorer.score(c, signals, config)
        );

        // Sort by heuristic score with stable fallback (ID)
        scoredCandidates.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return a.id.localeCompare(b.id);
        });

        let candidatesRerankedCount = 0;

        // 4. Reranking (Stage 2)
        if (config.enableLLMRerank && scoredCandidates.length > 0) {
            const s2Start = Date.now();
            try {
                // Only send top M candidates to LLM
                const topCandidates = scoredCandidates.slice(0, config.llmRerankTopM);
                candidatesRerankedCount = topCandidates.length;

                const rerankResult = await this.withTimeout(
                    this.reranker.rerank({
                        signals,
                        candidates: topCandidates,
                        prompt: userPrompt,
                        apiKey,
                        requestId,
                        weights: config.weights,
                        config: {
                            temperature: 0.1,
                            maxOutputTokens: 2000
                        }
                    }),
                    config.timeoutsMs.stage2,
                    'Stage 2 (Rerank)'
                );

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
                this.logger?.error(`[ImageSearchService] Reranking failed for request ${requestId}, falling back to heuristic order: `, error);
                notices.push({ code: 'RERANK_FAILED', message: 'Falling back to heuristic ranking.' });
                timings.stage2Ms = Date.now() - s2Start;
            }
        } else if (!config.enableLLMRerank) {
            notices.push({ code: 'RERANK_DISABLED', message: 'Stage 2 reranking is disabled.' });
        }

        timings.totalMs = Date.now() - startTime;
        const results = scoredCandidates.slice(0, config.rerankOutputK);

        // Structured Search Summary Logger
        this.logger?.info('[Search Summary] Completed', {
            requestId,
            timings,
            counts: {
                retrieved: initialCandidates.length,
                reranked: candidatesRerankedCount,
                returned: results.length
            },
            flags: {
                rerankEnabled: config.enableLLMRerank,
                hasPrompt: !!userPrompt,
                hasClientContext: !!clientContext,
                fallbackVision: signals.qualityFlags.lowConfidence || false,
                retrievalPlan
            }
        });

        const response: SearchResponse = {
            query: { prompt: userPrompt, signals },
            results,
            meta: {
                requestId,
                timings,
                notices,
                retrievalPlan
            }
        };

        // Record Telemetry
        this.telemetryService.record({
            requestId,
            timings,
            counts: {
                retrieved: initialCandidates.length,
                reranked: candidatesRerankedCount,
                returned: results.length
            },
            fallbacks: {
                visionFallback: signals.qualityFlags.lowConfidence || false,
                rerankFallback: notices.some(n => n.code === 'RERANK_FAILED'),
                broadRetrieval: retrievalPlan === 'C' || retrievalPlan === 'D'
            },
            retrievalPlan,
            error: null
        });

        return response;
    }
}
