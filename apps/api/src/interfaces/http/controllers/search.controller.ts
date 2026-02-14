import { FastifyRequest, FastifyReply } from 'fastify';
import { ImageSearchService } from '../../../services/image-search.service';
import { SearchImageHeadersSchema, SearchImageBodySchema } from '../schemas/search.schemas';

export class SearchController {
    constructor(private readonly imageSearchService: ImageSearchService) { }

    async searchByImage(request: FastifyRequest, reply: FastifyReply) {
        const requestId = (request.id as string) || `req_${Date.now()}`;
        const meta = { requestId, timings: null, notices: [] };

        // 1. Validate Headers
        const headerResult = SearchImageHeadersSchema.safeParse(request.headers);
        if (!headerResult.success) {
            return reply.code(400).send({
                data: null,
                error: {
                    code: 'VALIDATION_ERROR',
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
                    code: 'VALIDATION_ERROR',
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

        for await (const part of parts) {
            if (part.type === 'file' && part.fieldname === 'image') {
                if (!allowedMimeTypes.includes(part.mimetype)) {
                    return reply.code(400).send({
                        data: null,
                        error: {
                            code: 'VALIDATION_ERROR',
                            message: `Invalid file type: ${part.mimetype}. Allowed types: ${allowedMimeTypes.join(', ')}`
                        },
                        meta
                    });
                }
                imageBuffer = await part.toBuffer();
                mimeType = part.mimetype;
            } else if (part.type === 'field' && part.fieldname === 'prompt') {
                const promptValue = part.value as string;
                const bodyResult = SearchImageBodySchema.safeParse({ prompt: promptValue });

                if (!bodyResult.success) {
                    return reply.code(400).send({
                        data: null,
                        error: {
                            code: 'VALIDATION_ERROR',
                            message: 'Invalid prompt',
                            details: bodyResult.error.format()
                        },
                        meta
                    });
                }
                userPrompt = bodyResult.data.prompt;
            }
        }

        if (!imageBuffer) {
            return reply.code(400).send({
                data: null,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Missing image file in multipart body'
                },
                meta
            });
        }

        // 3. Coordinate Service
        const searchResults = await this.imageSearchService.searchByImage(
            imageBuffer,
            mimeType,
            apiKey,
            requestId,
            userPrompt
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
