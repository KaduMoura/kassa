import fs from 'fs';
import path from 'path';
import { GeminiVisionSignalExtractor } from '../apps/api/src/infra/ai/gemini/gemini-vision.service';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '../.env') });

async function main() {
    const imagePath = process.argv[2];
    const apiKey = process.env.GEMINI_API_KEY;

    if (!imagePath) {
        console.error('Please provide an image path: tsx scripts/test-gemini-vision.ts <path>');
        process.exit(1);
    }

    if (!apiKey) {
        console.error('Please set GEMINI_API_KEY in .env or as environment variable');
        process.exit(1);
    }

    const extractor = new GeminiVisionSignalExtractor();
    const imageBytes = fs.readFileSync(imagePath);
    const mimeType = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg';

    console.log(`🔍 Analyzing ${imagePath}...`);

    try {
        const start = Date.now();
        const signals = await extractor.extractSignals({
            imageBytes,
            mimeType,
            apiKey,
            requestId: 'cli-test',
        });
        const duration = Date.now() - start;

        console.log('✅ Signals Extracted:');
        console.log(JSON.stringify(signals, null, 2));
        console.log(`\n⏱️ Duration: ${duration}ms`);
    } catch (error: any) {
        console.error('❌ Error:', error.message);
        if (error.originalError) {
            console.error('Original Error Details:', error.originalError);
        }
    }
}

main();
