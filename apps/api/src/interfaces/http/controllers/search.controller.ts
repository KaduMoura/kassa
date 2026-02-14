import { FastifyRequest, FastifyReply } from 'fastify';
import { ImageSearchService } from '../../../services/image-search.service';
import { SearchImageHeadersSchema } from '../schemas/search.schemas';

export class SearchController {
    constructor(private readonly imageSearchService: ImageSearchService) { }

    async searchByImage(request: FastifyRequest, reply: FastifyReply) {
        // 1. Validate Headers
        const headerResult = SearchImageHeadersSchema.safeParse(request.headers);
        if (!headerResult.success) {
            return reply.code(400).send({
                error: 'Validation failed',
                details: headerResult.error.format()
            });
        }

        const apiKey = headerResult.data['x-ai-api-key'];
        const requestId = (request.headers['x-request-id'] as string) || `req_${Date.now()}`;

        // 2. Parse Multipart
        if (!request.isMultipart()) {
            return reply.code(400).send({ error: 'Expected multipart/form-data' });
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
                        error: `Invalid file type: ${part.mimetype}. Allowed types: ${allowedMimeTypes.join(', ')}`
                    });
                }
                imageBuffer = await part.toBuffer();
                mimeType = part.mimetype;
            } else if (part.type === 'field' && part.fieldname === 'prompt') {
                const promptValue = part.value as string;
                if (promptValue.length > 1000) {
                    return reply.code(400).send({ error: 'Prompt too long (max 1000 chars)' });
                }
                userPrompt = promptValue;
            }
        }

        if (!imageBuffer) {
            return reply.code(400).send({ error: 'Missing image file in multipart body' });
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
