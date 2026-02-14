import { GoogleGenerativeAI, GenerationConfig } from '@google/generative-ai';
import { VisionSignalExtractor, VisionSignalExtractorInput } from '../../../domain/ai/interfaces';
import { ImageSignals, ImageSignalsSchema, AiError, AiErrorCode } from '../../../domain/ai/schemas';
import { VISION_SYSTEM_PROMPT, VISION_USER_PROMPT_PREFIX } from './prompts/vision-v1';
import { createGeminiClient } from './client';
import { env } from '../../../config/env';

export class GeminiVisionSignalExtractor implements VisionSignalExtractor {
    async extractSignals(input: VisionSignalExtractorInput): Promise<ImageSignals> {
        const { imageBytes, mimeType, prompt, apiKey, config, requestId } = input;

        const genAI = createGeminiClient(apiKey);
        const model = genAI.getGenerativeModel({
            model: env.GEMINI_MODEL_VISION,
            systemInstruction: VISION_SYSTEM_PROMPT
        });

        const generationConfig: GenerationConfig = {
            temperature: config?.temperature ?? 0.1,
            maxOutputTokens: config?.maxOutputTokens ?? 1000,
            responseMimeType: 'application/json',
        };

        const userPrompt = prompt
            ? `${VISION_USER_PROMPT_PREFIX}\nUser intent: ${prompt}`
            : VISION_USER_PROMPT_PREFIX;
        const modelName = env.GEMINI_MODEL_VISION;

        console.log(`[LLM Vision] MODEL: ${modelName}`);
        console.log(`[LLM Vision] SYSTEM MESSAGE: ${VISION_SYSTEM_PROMPT}`);
        console.log(`[LLM Vision] USER PROMPT: ${userPrompt}`);

        const MAX_ATTEMPTS = 2;
        let lastError: any;

        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            try {
                const result = await model.generateContent({
                    contents: [{
                        role: 'user',
                        parts: [
                            { text: userPrompt },
                            {
                                inlineData: {
                                    mimeType,
                                    data: imageBytes.toString('base64'),
                                },
                            },
                        ],
                    }],
                    generationConfig,
                });

                const responseText = result.response.text();
                console.log(`[LLM Vision] RESULT: ${responseText}`);

                try {
                    const json = JSON.parse(responseText);
                    const validated = ImageSignalsSchema.safeParse(json);

                    if (!validated.success) {
                        throw new AiError(
                            AiErrorCode.PROVIDER_INVALID_RESPONSE,
                            'Failed to validate AI output schema',
                            validated.error.format()
                        );
                    }

                    return validated.data;
                } catch (parseError: any) {
                    if (parseError instanceof AiError) throw parseError;

                    throw new AiError(
                        AiErrorCode.PROVIDER_INVALID_RESPONSE,
                        'Failed to parse AI response as JSON',
                        responseText
                    );
                }
            } catch (error: any) {
                lastError = error;
                const status = error?.status || error?.response?.status;
                const message = error?.message || 'Unknown Vision error';

                console.error(`[Vision] Attempt ${attempt} failed for request ${requestId}: ${message}`);

                // Fail fast on auth
                if (status === 401 || status === 403) {
                    throw new AiError(AiErrorCode.PROVIDER_AUTH_ERROR, 'Invalid API Key', error);
                }

                if (attempt === MAX_ATTEMPTS) {
                    if (error instanceof AiError) throw error;
                    throw new AiError(AiErrorCode.INTERNAL_ERROR, message, error);
                }

                // Brief delay
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        throw new AiError(AiErrorCode.INTERNAL_ERROR, 'Vision signal extraction failed after retries');
    }
}
