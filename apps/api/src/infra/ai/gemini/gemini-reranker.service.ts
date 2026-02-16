import { GenerationConfig, SchemaType, Schema } from '@google/generative-ai';
import { CatalogReranker, CatalogRerankerInput } from '../../../domain/ai/interfaces';
import { RerankResult, RerankResultSchema, AiError, AiErrorCode } from '../../../domain/ai/schemas';
import { RERANK_SYSTEM_PROMPT, buildRerankUserPrompt } from './prompts/rerank-v1';
import { createGeminiClient } from './client';
import { env } from '../../../config/env';

/**
 * Strict Schema for Gemini Structured Outputs
 */
const RERANK_RESPONSE_SCHEMA: Schema = {
    type: SchemaType.OBJECT,
    properties: {
        results: {
            type: SchemaType.ARRAY,
            items: {
                type: SchemaType.OBJECT,
                properties: {
                    id: { type: SchemaType.STRING },
                    reasons: {
                        type: SchemaType.ARRAY,
                        items: { type: SchemaType.STRING }
                    }
                },
                required: ["id", "reasons"]
            },
            description: "List of candidates, ordered by relevance"
        }
    },
    required: ["results"]
};

export class GeminiCatalogReranker implements CatalogReranker {
    async rerank(input: CatalogRerankerInput): Promise<RerankResult> {
        const { signals, candidates, prompt, apiKey, config, requestId, weights } = input;

        if (candidates.length === 0) {
            return { rankedIds: [], reasons: {} };
        }

        const genAI = createGeminiClient(apiKey);
        const model = genAI.getGenerativeModel({
            model: env.GEMINI_MODEL_RERANK,
            systemInstruction: RERANK_SYSTEM_PROMPT
        });

        const generationConfig: GenerationConfig = {
            temperature: config?.temperature ?? 0.1,
            maxOutputTokens: config?.maxOutputTokens ?? 30000,
            responseMimeType: 'application/json',
            responseSchema: RERANK_RESPONSE_SCHEMA,
        };

        const userPrompt = buildRerankUserPrompt(signals, candidates, prompt, weights);
        const modelName = env.GEMINI_MODEL_RERANK;

        console.log(`[LLM Reranker] MODEL: ${modelName}`);
        console.log(`[LLM Reranker] SYSTEM MESSAGE: ${RERANK_SYSTEM_PROMPT}`);
        console.log(`[LLM Reranker] USER PROMPT: ${userPrompt}`);

        const MAX_ATTEMPTS = env.AI_RETRY_MAX;
        let lastError: any;

        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            console.info(`[Reranker] Attempt ${attempt}/${MAX_ATTEMPTS} for request ${requestId}`);
            try {
                const result = await model.generateContent({
                    contents: [{
                        role: 'user',
                        parts: [{ text: userPrompt }],
                    }],
                    generationConfig,
                });

                const responseText = result.response.text();
                console.log(`[LLM Reranker] RESULT: ${responseText}`);
                let rawData: any;

                try {
                    rawData = this.parseAndValidate(responseText);
                } catch (parseError) {
                    console.warn(`[Reranker] Primary JSON invalid on attempt ${attempt}, attempting repair with ${env.GEMINI_MODEL_VISION}...`);
                    rawData = await this.repairJsonWithFlash2_5(responseText, apiKey, requestId, input.config?.repairTimeoutMs);
                }

                // If we reach here, we have rawData (either from primary or repair)
                const validated: RerankResult = {
                    rankedIds: rawData.results.map((r: any) => r.id),
                    reasons: rawData.results.reduce((acc: any, curr: any) => {
                        acc[curr.id] = curr.reasons;
                        return acc;
                    }, {})
                };

                // Pre-filtering: Ensure all returned IDs exist in candidates
                const candidateIds = new Set(candidates.map(c => c.id));
                const filteredIds = validated.rankedIds.filter((id: string) => candidateIds.has(id));

                // Post-filling: Append any missing IDs from candidates to the end
                const rankedSet = new Set(filteredIds);
                candidates.forEach(c => {
                    if (!rankedSet.has(c.id)) {
                        filteredIds.push(c.id);
                    }
                });

                console.info(`[Reranker] Successfully reranked on attempt ${attempt} for request ${requestId}`);
                return {
                    rankedIds: filteredIds,
                    reasons: validated.reasons || {},
                };

            } catch (error: any) {
                lastError = error;
                const status = error?.status || error?.response?.status;
                const message = error?.message || 'Unknown Rerank error';

                console.error(`[Reranker] Attempt ${attempt} failed for request ${requestId}: ${message}`);

                // detailed debug info
                if (error?.response) {
                    console.error("DEBUG: Error Response:", JSON.stringify(error.response, null, 2));
                }

                // Fail fast on auth errors
                if (status === 401 || status === 403) {
                    throw new AiError(AiErrorCode.PROVIDER_AUTH_ERROR, 'Invalid API Key', error);
                }

                if (attempt === MAX_ATTEMPTS) {
                    if (error instanceof AiError) throw error;
                    // Final attempt failed, throw as internal error
                    throw new AiError(AiErrorCode.INTERNAL_ERROR, `Reranking failed after ${MAX_ATTEMPTS} attempts: ${message}`, error);
                }

                // Exponential backoff for retriable errors
                const delay = Math.min(Math.pow(2, attempt) * 1000, 5000);
                console.info(`[Reranker] Waiting ${delay}ms before next attempt...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        throw new AiError(AiErrorCode.INTERNAL_ERROR, 'Reranking failed: Maximum attempts exceeded');
    }

    /**
     * Dedicated repair function using Gemini 2.5 Flash
     * Includes automatic retries and Structured Outputs for the repair itself.
     */
    private async repairJsonWithFlash2_5(
        malformedJson: string,
        apiKey: string,
        requestId: string,
        timeoutMs?: number,
        maxRetries = env.AI_RETRY_MAX
    ): Promise<any> {
        const genAI = createGeminiClient(apiKey);
        const systemMessage = "You are a JSON repair expert. Fix the malformed JSON to match the required schema exactly.";
        const modelName = env.GEMINI_MODEL_VISION;
        const model = genAI.getGenerativeModel({
            model: modelName, // Use 2.5 Flash
            systemInstruction: systemMessage
        });

        const generationConfig: GenerationConfig = {
            temperature: 0, // Strict
            maxOutputTokens: 30000,
            responseMimeType: 'application/json',
            responseSchema: RERANK_RESPONSE_SCHEMA,
        };

        let lastError: any;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const userPrompt = `Repair this malformed JSON: ${malformedJson}\nReturn ONLY the valid JSON.`;
                console.log(`[LLM Repair] MODEL: ${modelName}`);
                console.log(`[LLM Repair] SYSTEM MESSAGE: ${systemMessage}`);
                console.log(`[LLM Repair] USER PROMPT: ${userPrompt}`);

                const generatePromise = model.generateContent({
                    contents: [{
                        role: 'user',
                        parts: [{ text: userPrompt }],
                    }],
                    generationConfig,
                });

                let result;
                if (timeoutMs) {
                    const timeoutPromise = new Promise((_, reject) =>
                        setTimeout(() => reject(new AiError(AiErrorCode.PROVIDER_TIMEOUT, `Repair timed out after ${timeoutMs}ms`)), timeoutMs)
                    );
                    result = (await Promise.race([generatePromise, timeoutPromise])) as any;
                } else {
                    result = await generatePromise;
                }

                const fixedText = result.response.text();
                console.log(`[LLM Repair] RESULT: ${fixedText}`);
                return this.parseAndValidate(fixedText);
            } catch (error) {
                lastError = error;
                console.warn(`[Reranker] Repair attempt ${attempt}/${maxRetries} failed for request ${requestId}:`, error);
            }
        }

        throw new AiError(
            AiErrorCode.PROVIDER_INVALID_RESPONSE,
            `Failed to repair JSON after ${maxRetries} attempts`,
            { originalMalformed: malformedJson, lastError }
        );
    }

    private parseAndValidate(text: string): any {
        try {
            // Basic sanitization: sometimes model wraps in ```json ... ```
            const cleaned = text.replace(/```json\n?/, '').replace(/\n?```/, '').trim();
            const json = JSON.parse(cleaned);
            // Internal validation of the raw results array
            if (!json.results || !Array.isArray(json.results)) {
                throw new Error("Invalid response format: expected 'results' array");
            }
            return json;
        } catch (e: any) {
            if (e instanceof AiError) throw e;
            throw new AiError(
                AiErrorCode.PROVIDER_INVALID_RESPONSE,
                'Failed to parse Rerank response as JSON',
                text
            );
        }
    }
}
