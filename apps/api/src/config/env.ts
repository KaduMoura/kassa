import { z } from 'zod';
import * as dotenv from 'dotenv';


// Load .env from root or current directory
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });
dotenv.config();

const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.preprocess((val) => Number(val), z.number()).default(4000),
    MONGO_URI: z.string().url().default('mongodb://localhost:27017/test'),
    CORS_ORIGIN: z.string().default('*'),
    STAGE1_TIMEOUT_MS: z.preprocess((val) => Number(val), z.number()).default(60000),
    STAGE2_TIMEOUT_MS: z.preprocess((val) => Number(val), z.number()).default(60000),
    TOTAL_TIMEOUT_MS: z.preprocess((val) => Number(val), z.number()).default(120000),
    MAX_UPLOAD_BYTES: z.preprocess((val) => Number(val), z.number()).default(10485760), // 10MB
    ADMIN_TOKEN: z.string().default('debug-secret'),
    // AI Models & Provider (from docs/14)
    AI_PROVIDER: z.string().default('gemini'),
    GEMINI_MODEL_VISION: z.string().default('gemini-2.5-flash'),
    GEMINI_MODEL_RERANK: z.string().default('gemini-3-flash-preview'),
    AI_RETRY_MAX: z.preprocess((val) => Number(val), z.number()).default(4),
    // Missing compliance knobs (docs/10)
    MIN_CANDIDATES: z.preprocess((val) => Number(val), z.number()).default(10),
    MAX_KEYWORDS: z.preprocess((val) => Number(val), z.number()).default(8),
    MAX_DESCRIPTION_CHARS: z.preprocess((val) => Number(val), z.number()).default(300),
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
    console.error('❌ Invalid environment variables:', _env.error.format());
    process.exit(1);
}

export const env = _env.data;
