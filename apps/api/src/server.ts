import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { pino } from 'pino';
import * as dotenv from 'dotenv';

dotenv.config();

const server = Fastify({
    logger: process.env.NODE_ENV === 'production' ? true : {
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
        await server.register(cors, {
            origin: process.env.CORS_ORIGIN || '*',
        });

        await server.register(multipart, {
            limits: {
                fileSize: 10 * 1024 * 1024, // 10MB
            },
        });

        // Health Check Route
        server.get('/health', async () => {
            return { status: 'OK', timestamp: new Date().toISOString() };
        });

        const port = Number(process.env.PORT) || 4000;
        const host = '0.0.0.0';

        await server.listen({ port, host });

        console.log(`🚀 API execution started on http://localhost:${port}`);

        // Graceful Shutdown
        const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];
        signals.forEach((signal) => {
            process.on(signal, async () => {
                server.log.info(`Received ${signal}, closing server...`);
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
