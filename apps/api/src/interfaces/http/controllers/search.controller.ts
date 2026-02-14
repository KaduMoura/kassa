import { FastifyRequest, FastifyReply } from 'fastify';
import sharp from 'sharp';
import { ImageSearchService } from '../../../services/image-search.service';
import { SearchImageHeadersSchema, SearchImageBodySchema } from '../schemas/search.schemas';

export class SearchController {
    constructor(private readonly imageSearchService: ImageSearchService) { }

    private isValidMagicBytes(buffer: Buffer): boolean {
        // JPEG: FF D8 FF
        if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return true;
        // PNG: 89 50 4E 47
        if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return true;
        // WebP: RIFF .... WEBP
        if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
            buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) return true;

        return false;
    }

    async searchByImage(request: FastifyRequest, reply: FastifyReply) {
        const requestId = (request.id as string) || `req_${Date.now()}`;
        const meta = { requestId, timings: null, notices: [] };

        // 1. Validate Headers
        const headerResult = SearchImageHeadersSchema.safeParse(request.headers);
        if (!headerResult.success) {
            return reply.code(400).send({
                data: null,
                error: {
                    code: 'VALIDATION_HEADERS',
                    message: 'Invalid headers',
                    details: headerResult.error.format()
                },
                meta
            });
        }

        const apiKey = headerResult.data['x-ai-api-key'];

        // 2. Parse Multipart
        if (!request.isMultipart()) {
            return reply.code(400).send({
                data: null,
                error: {
                    code: 'VALIDATION_MULTIPART',
                    message: 'Expected multipart/form-data'
                },
                meta
            });
        }

        const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
        const parts = request.parts();
        let imageBuffer: Buffer | null = null;
        let mimeType = '';
        let userPrompt: string | undefined;
        let clientContext: Record<string, any> | undefined;

        for await (const part of parts) {
            if (part.type === 'file' && part.fieldname === 'image') {
                if (!allowedMimeTypes.includes(part.mimetype)) {
                    return reply.code(400).send({
                        data: null,
                        error: {
                            code: 'VALIDATION_IMAGE_FORMAT',
                            message: `Invalid file type: ${part.mimetype}. Allowed types: ${allowedMimeTypes.join(', ')}`
                        },
                        meta
                    });
                }
                imageBuffer = await part.toBuffer();

                // Magic byte validation to prevent spoofing
                if (!this.isValidMagicBytes(imageBuffer)) {
                    return reply.code(400).send({
                        data: null,
                        error: {
                            code: 'VALIDATION_IMAGE_CONTENT',
                            message: 'Invalid image content: Magic bytes do not match expected format.'
                        },
                        meta
                    });
                }

                mimeType = part.mimetype;
            } else if (part.type === 'field' && (part.fieldname === 'prompt' || part.fieldname === 'clientContext')) {
                const value = part.value as string;

                if (part.fieldname === 'prompt') {
                    const bodyResult = SearchImageBodySchema.safeParse({ prompt: value });
                    if (!bodyResult.success) {
                        return reply.code(400).send({
                            data: null,
                            error: {
                                code: 'VALIDATION_PROMPT',
                                message: 'Invalid prompt',
                                details: bodyResult.error.format()
                            },
                            meta
                        });
                    }
                    userPrompt = bodyResult.data.prompt;
                } else if (part.fieldname === 'clientContext') {
                    try {
                        const parsed = JSON.parse(value);
                        const bodyResult = SearchImageBodySchema.safeParse({ clientContext: parsed });
                        if (!bodyResult.success) {
                            return reply.code(400).send({
                                data: null,
                                error: {
                                    code: 'VALIDATION_CLIENT_CONTEXT',
                                    message: 'Invalid clientContext',
                                    details: bodyResult.error.format()
                                },
                                meta
                            });
                        }
                        clientContext = bodyResult.data.clientContext;
                    } catch (e) {
                        return reply.code(400).send({
                            data: null,
                            error: {
                                code: 'VALIDATION_CLIENT_CONTEXT',
                                message: 'clientContext must be a valid JSON string'
                            },
                            meta
                        });
                    }
                }
            }
        }

        if (!imageBuffer) {
            return reply.code(400).send({
                data: null,
                error: {
                    code: 'VALIDATION_MISSING_IMAGE',
                    message: 'Missing image file in multipart body'
                },
                meta
            });
        }

        // 2.5 Image Processing (Strip EXIF & Quality Check)
        try {
            const metadata = await sharp(imageBuffer).metadata();

            // Quality Check: Minimum dimensions
            const minDim = 256;
            if (metadata.width && metadata.height && (metadata.width < minDim || metadata.height < minDim)) {
                return reply.code(400).send({
                    data: null,
                    error: {
                        code: 'VALIDATION_IMAGE_TOO_SMALL',
                        message: `Image too small (${metadata.width}x${metadata.height}). Minimum required: ${minDim}x${minDim}.`,
                        details: { width: metadata.width, height: metadata.height, required: minDim }
                    },
                    meta
                });
            }

            imageBuffer = await sharp(imageBuffer).rotate().toBuffer(); // .rotate() handles orientation then strips tags on toBuffer by default
        } catch (error) {
            request.log.warn({ requestId, error }, 'Failed to process image metadata or strip EXIF');
            // Continue with original buffer if processing fails, but dimension check might have been skipped
        }

        // 3. Coordinate Service
        const searchResults = await this.imageSearchService.searchByImage(
            imageBuffer,
            mimeType,
            apiKey,
            requestId,
            userPrompt,
            clientContext
        );

        return reply.code(200).send({
            data: {
                query: searchResults.query,
                results: searchResults.results
            },
            error: null,
            meta: searchResults.meta
        });
    }
}
