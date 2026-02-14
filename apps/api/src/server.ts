import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { env } from './config/env';
import { connectToDatabase, disconnectFromDatabase } from './infra/db';
import { CatalogRepository } from './infra/repositories/catalog.repository';
import { ImageSearchService } from './services/image-search.service';

import { GeminiVisionSignalExtractor } from './infra/ai/gemini/gemini-vision.service';
import { GeminiCatalogReranker } from './infra/ai/gemini/gemini-reranker.service';
import { AiError, AiErrorCode } from './domain/ai/schemas';
import { HeuristicScorer } from './domain/ranking/heuristic-scorer';
import { appConfigService } from './config/app-config.service';
import { telemetryService } from './services/telemetry.service';
import { searchRoutes } from './interfaces/http/routes/search.routes';
import { adminRoutes } from './interfaces/http/routes/admin.routes';

const server = Fastify({
    logger: env.NODE_ENV === 'production' ? true : {
        transport: {
            target: 'pino-pretty',
            options: {
                translateTime: 'HH:MM:ss Z',
                ignore: 'pid,hostname',
            },
        },
    },
});

async function bootstrap() {
    try {
        // Infrastructure
        await connectToDatabase();

        // Middleware
        await server.register(cors, {
            origin: env.CORS_ORIGIN,
        });

        await server.register(multipart, {
            limits: {
                fileSize: 10 * 1024 * 1024, // 10MB
            },
        });

        // Error Handler
        server.setErrorHandler((error, request, reply) => {
            // Log full error details
            request.log.error(error);

            const requestId = request.id;
            const meta = { requestId, timings: null, notices: [] };

            if (error instanceof AiError) {
                const statusMap: Record<AiErrorCode, number> = {
                    [AiErrorCode.AI_AUTH_ERROR]: 401,
                    [AiErrorCode.AI_RATE_LIMIT]: 429,
                    [AiErrorCode.AI_TIMEOUT]: 408,
                    [AiErrorCode.AI_INVALID_OUTPUT]: 502,
                    [AiErrorCode.AI_NETWORK_ERROR]: 503,
                    [AiErrorCode.AI_INTERNAL_ERROR]: 500,
                    [AiErrorCode.AI_CONTEXT_TOO_LARGE]: 413,
                };

                const status = statusMap[error.code] || 500;
                return reply.code(status).send({
                    data: null,
                    error: {
                        code: error.code,
                        message: error.message,
                        details: (error as any).originalError || null
                    },
                    meta
                });
            }

            // Handle validation errors (Fastify standard)
            if (error.validation) {
                return reply.code(400).send({
                    data: null,
                    error: {
                        code: 'VALIDATION_ERROR',
                        message: 'Validation failed',
                        details: error.validation
                    },
                    meta
                });
            }

            // Default sanitized handler for internal errors
            const status = error.statusCode || 500;
            const isProd = env.NODE_ENV === 'production';

            return reply.code(status).send({
                data: null,
                error: {
                    code: 'INTERNAL_SERVER_ERROR',
                    message: isProd ? 'Internal Server Error' : error.message,
                    details: isProd ? null : { stack: error.stack }
                },
                meta
            });
        });

        // Routes
        server.get('/health', async () => {
            return { status: 'OK', timestamp: new Date().toISOString() };
        });

        await server.register(searchRoutes, { prefix: '/api/search' });
        await server.register(adminRoutes, { prefix: '/api/admin' });

        // Debug Route (Temporary)
        server.get('/debug/catalog', async () => {
            const repo = new CatalogRepository();
            const sample = await repo.getSample();
            return {
                database: 'connected',
                sampleProduct: sample || 'No products found'
            };
        });

        // Debug Pipeline (Temporary)
        server.get('/debug/search-pipeline', async (request, reply) => {
            const apiKey = request.headers['x-ai-api-key'] as string;
            if (!apiKey) {
                return reply.code(400).send({ error: 'Missing x-ai-api-key header' });
            }

            const repo = new CatalogRepository();
            const vision = new GeminiVisionSignalExtractor();
            const reranker = new GeminiCatalogReranker();
            const heuristicScorer = new HeuristicScorer();
            const service = new ImageSearchService(
                vision,
                repo,
                reranker,
                heuristicScorer,
                appConfigService,
                telemetryService,
                server.log
            );

            return {
                message: 'ImageSearchService initialized successfully.',
                usage: 'This endpoint verifies that the Two-Stage AI Pipeline is correctly wired.',
                ready: true
            };
        });

        const port = env.PORT;
        const host = '0.0.0.0';

        await server.listen({ port, host });

        console.log(`🚀 API execution started on http://localhost:${port}`);

        // Graceful Shutdown
        const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];
        signals.forEach((signal) => {
            process.on(signal, async () => {
                server.log.info(`Received ${signal}, closing server...`);
                await disconnectFromDatabase();
                await server.close();
                process.exit(0);
            });
        });
    } catch (err) {
        server.log.error(err);
        process.exit(1);
    }
}

bootstrap();
