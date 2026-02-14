import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Creates a Gemini client session with the provided API key.
 * This ensures the key is handled only in memory for the duration of the request/operation.
 */
export function createGeminiClient(apiKey: string) {
    return new GoogleGenerativeAI(apiKey);
}
