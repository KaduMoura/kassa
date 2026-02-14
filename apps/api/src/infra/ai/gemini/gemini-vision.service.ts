import { GoogleGenerativeAI, GenerationConfig } from '@google/generative-ai';
import { VisionSignalExtractor, VisionSignalExtractorInput } from '../../../domain/ai/interfaces';
import { ImageSignals, ImageSignalsSchema, AiError, AiErrorCode } from '../../../domain/ai/schemas';
import { VISION_SYSTEM_PROMPT, VISION_USER_PROMPT_PREFIX } from './prompts/vision-v1';
import { createGeminiClient } from './client';
import { env } from '../../../config/env';

export class GeminiVisionSignalExtractor implements VisionSignalExtractor {
    async extractSignals(input: VisionSignalExtractorInput): Promise<ImageSignals> {
        const { imageBytes, mimeType, prompt, apiKey, config } = input;

        try {
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

            try {
                const json = JSON.parse(responseText);
                const validated = ImageSignalsSchema.safeParse(json);

                if (!validated.success) {
                    throw new AiError(
                        AiErrorCode.AI_INVALID_OUTPUT,
                        'Failed to validate AI output schema',
                        validated.error.format()
                    );
                }

                return validated.data;
            } catch (parseError: any) {
                if (parseError instanceof AiError) throw parseError;

                throw new AiError(
                    AiErrorCode.AI_INVALID_OUTPUT,
                    'Failed to parse AI response as JSON',
                    responseText
                );
            }
        } catch (error: any) {
            if (error instanceof AiError) throw error;

            // Map common Gemini errors
            const status = error?.status || error?.response?.status;
            const message = error?.message || 'Unknown AI error';

            if (status === 401 || status === 403) {
                throw new AiError(AiErrorCode.AI_AUTH_ERROR, 'Invalid API Key', error);
            }
            if (status === 429) {
                throw new AiError(AiErrorCode.AI_RATE_LIMIT, 'Quota exceeded', error);
            }

            throw new AiError(AiErrorCode.AI_INTERNAL_ERROR, message, error);
        }
    }
}
