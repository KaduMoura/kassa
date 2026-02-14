import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiVisionSignalExtractor } from './gemini-vision.service';
import { AiErrorCode } from '../../../domain/ai/schemas';

// Mock the Gemini SDK
const mockGenerateContent = vi.fn();
const mockGetGenerativeModel = vi.fn().mockReturnValue({
    generateContent: mockGenerateContent,
});

vi.mock('@google/generative-ai', () => ({
    GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
        getGenerativeModel: mockGetGenerativeModel,
    })),
}));

describe('GeminiVisionSignalExtractor', () => {
    let extractor: GeminiVisionSignalExtractor;

    beforeEach(() => {
        extractor = new GeminiVisionSignalExtractor();
        vi.clearAllMocks();
    });

    it('should successfully extract and validate signals', async () => {
        const mockOutput = {
            categoryGuess: { value: 'Chair', confidence: 0.9 },
            typeGuess: { value: 'Dining Chair', confidence: 0.85 },
            attributes: {
                style: ['Modern'],
                material: ['Wood'],
                color: ['Brown'],
                shape: ['Curved'],
            },
            keywords: ['modern wood chair'],
            qualityFlags: {
                isFurnitureLikely: true,
                multipleObjects: false,
                lowImageQuality: false,
                occludedOrPartial: false,
                lowConfidence: false,
            },
        };

        mockGenerateContent.mockResolvedValue({
            response: {
                text: () => JSON.stringify(mockOutput),
            },
        });

        const result = await extractor.extractSignals({
            imageBytes: Buffer.from('fake-image'),
            mimeType: 'image/jpeg',
            apiKey: 'fake-key',
            requestId: 'test-req',
        });

        expect(result).toEqual(expect.objectContaining({
            categoryGuess: expect.objectContaining({ value: 'Chair' }),
        }));
        expect(mockGetGenerativeModel).toHaveBeenCalledWith(expect.objectContaining({
            model: 'gemini-2.5-flash',
        }));
    });

    it('should throw AI_INVALID_OUTPUT when response is not valid JSON', async () => {
        mockGenerateContent.mockResolvedValue({
            response: {
                text: () => 'not a json',
            },
        });

        await expect(extractor.extractSignals({
            imageBytes: Buffer.from('fake-image'),
            mimeType: 'image/jpeg',
            apiKey: 'fake-key',
            requestId: 'test-req',
        })).rejects.toThrow(/Failed to parse AI response/);
    });

    it('should throw AI_AUTH_ERROR on 401 response', async () => {
        const error = new Error('Auth failed');
        (error as any).status = 401;
        mockGenerateContent.mockRejectedValue(error);

        await expect(extractor.extractSignals({
            imageBytes: Buffer.from('fake-image'),
            mimeType: 'image/jpeg',
            apiKey: 'fake-key',
            requestId: 'test-req',
        })).rejects.toThrow(/Invalid API Key/);
    });
});
