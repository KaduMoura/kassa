// --- SET ENV BEFORE IMPORTS ---
process.env.GEMINI_MODEL_VISION = 'gemini-2.5-flash';
process.env.GEMINI_MODEL_RERANK = 'gemini-3-flash-preview';

import fs from 'fs';
import path from 'path';
import { GeminiVisionSignalExtractor } from '../src/infra/ai/gemini/gemini-vision.service';
import { GeminiCatalogReranker } from '../src/infra/ai/gemini/gemini-reranker.service';
import { ImageSignals } from '../src/domain/ai/schemas';

// --- CONFIGURATION ---
const API_KEY = process.env.GOOGLE_API_KEY as string;
const IMAGE_PATH = '/home/kadu/.gemini/antigravity/brain/2a3c9e1e-d7ce-4964-803f-54640c03fef4/test_chair_image_1771012856764.png';

if (!API_KEY) {
    console.error('❌ GOOGLE_API_KEY environment variable is required.');
    process.exit(1);
}

async function runTests() {
    console.log('🚀 Starting Gemini Integration Tests with gemini-2.5-flash and gemini-3-flash-preview (Fixed Env)...');

    // 1. Vision Signal Extraction
    console.log('\n--- 🔭 Test 1: Vision Signal Extraction ---');
    if (!fs.existsSync(IMAGE_PATH)) {
        console.error(`❌ Image not found at ${IMAGE_PATH}`);
        process.exit(1);
    }

    const imageBytes = fs.readFileSync(IMAGE_PATH);
    const visionService = new GeminiVisionSignalExtractor();

    let signals: ImageSignals;
    try {
        console.log('⏳ Calling Vision service...');
        signals = await visionService.extractSignals({
            imageBytes,
            mimeType: 'image/png',
            apiKey: API_KEY,
            requestId: 'test-vision-integration',
            prompt: 'Identify this furniture item'
        });
        console.log('✅ Vision success!');
        console.log('Signals extracted:', JSON.stringify(signals, null, 2));
    } catch (error: any) {
        console.error('❌ Vision failed:', error);
        if (error.originalError) {
            console.error('Original Error details:', JSON.stringify(error.originalError, null, 2));
        }
        return;
    }

    // 2. Reranking
    console.log('\n--- 📊 Test 2: Candidate Reranking ---');
    const rerankerService = new GeminiCatalogReranker();
    const mockCandidates = [
        { id: '1', title: 'Modern Wooden Dining Chair', category: 'Chair', type: 'Dining Chair', price: 150, description: 'Elegant wooden chair with leather seat.' },
        { id: '2', title: 'Office Swivel Chair', category: 'Chair', type: 'Office Chair', price: 250, description: 'Ergonomic office chair with wheels.' },
        { id: '3', title: 'Round Oak Dining Table', category: 'Table', type: 'Dining Table', price: 500, description: 'Solid oak dining table for 4 people.' },
    ];

    try {
        console.log('⏳ Calling Rerank service...');
        const rerankResult = await rerankerService.rerank({
            signals,
            candidates: mockCandidates as any,
            apiKey: API_KEY,
            requestId: 'test-rerank-integration',
            prompt: 'I need a chair for my dining room'
        });
        console.log('✅ Rerank success!');
        console.log('Ranked IDs:', rerankResult.rankedIds);
        console.log('Reasons:', JSON.stringify(rerankResult.reasons, null, 2));
    } catch (error) {
        console.error('❌ Rerank failed:', error);
    }

    console.log('\n🏁 Tests Completed.');
}

runTests().catch(console.error);
