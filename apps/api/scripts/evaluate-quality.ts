import fs from 'fs';
import path from 'path';

interface GoldenCase {
    id: string;
    label: string;
    imagePath: string;
    prompt?: string;
    expectedCategory: string;
    expectedType: string;
}

interface EvalResult {
    testCase: GoldenCase;
    rank: number | null;
    hitAt1: boolean;
    hitAt3: boolean;
    hitAt5: boolean;
    mrr: number;
}

/**
 * Quality Evaluation Script (Automated Hit@K and MRR)
 * Run with: npx ts-node scripts/evaluate-quality.ts
 */
async function evaluate() {
    console.log('🚀 Starting Quality Evaluation...');

    const goldenSetPath = path.join(__dirname, '../golden-set.json');
    if (!fs.existsSync(goldenSetPath)) {
        console.error(`❌ Golden set File not found: ${goldenSetPath}`);
        process.exit(1);
    }

    const goldenSet: GoldenCase[] = JSON.parse(fs.readFileSync(goldenSetPath, 'utf8'));
    const API_URL = process.env.API_URL || 'http://localhost:4000/api/search';
    const API_KEY = process.env.GEMINI_API_KEY;

    if (!API_KEY) {
        console.error('❌ Error: GEMINI_API_KEY environment variable is required.');
        process.exit(1);
    }

    const baselineResults: EvalResult[] = [];
    const augmentedResults: EvalResult[] = [];

    console.log('\n--- Phase 1: Baseline (Image Only) ---');
    for (const testCase of goldenSet) {
        const result = await runTest(testCase, API_URL, API_KEY, true); // No prompt
        if (result) baselineResults.push(result);
    }

    console.log('\n--- Phase 2: Augmented (with Prompt) ---');
    for (const testCase of goldenSet) {
        const result = await runTest(testCase, API_URL, API_KEY, false); // With prompt
        if (result) augmentedResults.push(result);
    }

    printReport(baselineResults, augmentedResults);
}

async function runTest(testCase: GoldenCase, apiUrl: string, apiKey: string, stripPrompt: boolean): Promise<EvalResult | null> {
    const label = stripPrompt ? `[BL] ${testCase.label}` : `[AU] ${testCase.label}`;
    process.stdout.write(`🔍 Testing: ${label.padEnd(50)} `);

    const imageAbsPath = path.join(__dirname, '../', testCase.imagePath);
    if (!fs.existsSync(imageAbsPath)) {
        console.log('⚠️  [SKIP: Image missing]');
        return null;
    }

    const formData = new FormData();
    const blob = new Blob([fs.readFileSync(imageAbsPath)], { type: 'image/jpeg' });
    formData.append('image', blob, path.basename(testCase.imagePath));
    if (testCase.prompt && !stripPrompt) formData.append('prompt', testCase.prompt);

    try {
        const start = Date.now();
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'x-ai-api-key': apiKey },
            body: formData
        });

        if (!response.ok) {
            console.log(`❌ [API Error: ${response.status}]`);
            return null;
        }

        const jsonResponse = await response.json() as any;
        const candidates = jsonResponse.data?.results || [];

        const rank = candidates.findIndex((c: any) =>
            c.id === testCase.id ||
            c.title.toLowerCase().includes(testCase.id.toLowerCase().replace(/_/g, ' '))
        ) + 1;

        console.log(rank > 0 ? `✅ Rank ${rank} (${Date.now() - start}ms)` : '🔴 Not found');

        return {
            testCase,
            rank: rank > 0 ? rank : null,
            hitAt1: rank === 1,
            hitAt3: rank > 0 && rank <= 3,
            hitAt5: rank > 0 && rank <= 5,
            mrr: rank > 0 ? 1 / rank : 0
        };
    } catch (error: any) {
        console.log(`❌ [Fetch Error: ${error.message}]`);
        return null;
    }
}

function printReport(baseline: EvalResult[], augmented: EvalResult[]) {
    const calcMetrics = (results: EvalResult[]) => {
        const total = results.length;
        if (total === 0) return { h1: 0, h5: 0, mrr: 0 };
        return {
            h1: (results.filter(r => r.hitAt1).length / total) * 100,
            h5: (results.filter(r => r.hitAt5).length / total) * 100,
            mrr: results.reduce((sum, r) => sum + r.mrr, 0) / total
        };
    };

    const bMetrics = calcMetrics(baseline);
    const aMetrics = calcMetrics(augmented);

    console.log('\n' + '='.repeat(60));
    console.log('              FINAL QUALITY EVALUATION REPORT');
    console.log('='.repeat(60));
    console.log(`Metric           Baseline (Img)    Augmented (+P)    Prompt Lift`);
    console.log('-'.repeat(60));
    console.log(`Hit@1 Precision  ${bMetrics.h1.toFixed(1).padEnd(17)} ${aMetrics.h1.toFixed(1).padEnd(17)} ${(aMetrics.h1 - bMetrics.h1).toFixed(1)}%`);
    console.log(`Hit@5 Coverage   ${bMetrics.h5.toFixed(1).padEnd(17)} ${aMetrics.h5.toFixed(1).padEnd(17)} ${(aMetrics.h5 - bMetrics.h5).toFixed(1)}%`);
    console.log(`Mean MRR         ${bMetrics.mrr.toFixed(4).padEnd(17)} ${aMetrics.mrr.toFixed(4).padEnd(17)} ${(aMetrics.mrr - bMetrics.mrr).toFixed(4)}`);
    console.log('='.repeat(60));
    console.log(`Report generated on: ${new Date().toLocaleString()}\n`);
}

evaluate().catch(err => {
    console.error('💥 Fatal evaluation error:', err);
    process.exit(1);
});
