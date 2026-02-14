import { ImageSignals, ScoredCandidate, MatchBand, CandidateSummary } from '../ai/schemas';
import { AdminConfig } from '../config.schema';

export class HeuristicScorer {
    /**
     * Scores a candidate against extracted signals using controlled weights.
     */
    public score(candidate: CandidateSummary, signals: ImageSignals, config: AdminConfig): ScoredCandidate {
        let totalScore = 0;
        const reasons: string[] = [];

        // 1. Text Similarity (Keywords vs Title/Description)
        const textScore = this.calculateTextSimilarity(candidate, signals.keywords);
        totalScore += textScore * config.weights.text;
        if (textScore > 0.6) reasons.push('Keyword match');

        // 2. Category Match
        const categoryMatch = candidate.category.toLowerCase() === signals.categoryGuess.value.toLowerCase();
        const categoryScore = categoryMatch ? 1 : 0;
        totalScore += categoryScore * config.weights.category;
        if (categoryMatch) reasons.push('Category match');

        // 3. Type Match
        const typeMatch = candidate.type.toLowerCase() === signals.typeGuess.value.toLowerCase();
        const typeScore = typeMatch ? 1 : 0;
        totalScore += typeScore * config.weights.type;
        if (typeMatch) reasons.push('Type match');

        // 4. Attributes (Style, Material, Color)
        const attributeScore = this.calculateAttributeMatch(candidate, signals);
        totalScore += attributeScore * config.weights.attributes;
        if (attributeScore > 0.5) reasons.push('Visual attributes match');

        // 5. Price Proximity (if requested in intent)
        if (signals.intent?.priceMax || signals.intent?.priceMin) {
            const priceScore = this.calculatePriceMatch(candidate.price, signals.intent.priceMax, signals.intent.priceMin);
            totalScore += priceScore * config.weights.price;
            if (priceScore > 0.8) reasons.push('Price matches preference');
        }

        // 6. Dimensions Proximity (if requested in intent)
        if (signals.intent?.preferredWidth || signals.intent?.preferredHeight || signals.intent?.preferredDepth) {
            const dimScore = this.calculateDimensionMatch(candidate, signals.intent);
            totalScore += dimScore * config.weights.dimensions;
            if (dimScore > 0.8) reasons.push('Dimensions match preference');
        }

        // Determine Match Band
        let matchBand = MatchBand.LOW;
        if (totalScore >= config.matchBands.high) {
            matchBand = MatchBand.HIGH;
        } else if (totalScore >= config.matchBands.medium) {
            matchBand = MatchBand.MEDIUM;
        }

        return {
            ...candidate,
            score: Number(totalScore.toFixed(4)),
            matchBand,
            reasons: reasons.slice(0, 3) // Cap reasons for UI
        };
    }

    private calculateTextSimilarity(candidate: CandidateSummary, keywords: string[]): number {
        if (!keywords.length) return 0;

        const content = `${candidate.title} ${candidate.description}`.toLowerCase();
        let matches = 0;

        for (const kw of keywords) {
            if (content.includes(kw.toLowerCase())) {
                matches++;
            }
        }

        return matches / keywords.length;
    }

    private calculateAttributeMatch(candidate: CandidateSummary, signals: ImageSignals): number {
        const content = `${candidate.title} ${candidate.description}`.toLowerCase();
        const attributes = [
            ...signals.attributes.style,
            ...signals.attributes.material,
            ...signals.attributes.color
        ];

        if (!attributes.length) return 0;

        let matches = 0;
        for (const attr of attributes) {
            if (content.includes(attr.toLowerCase())) {
                matches++;
            }
        }

        return matches / attributes.length;
    }

    private calculatePriceMatch(price: number, max?: number, min?: number): number {
        if (max && price > max) {
            const overshoot = (price - max) / max;
            return Math.max(0, 1 - overshoot); // Penalty 
        }
        if (min && price < min) {
            const undershoot = (min - price) / min;
            return Math.max(0, 1 - undershoot);
        }
        return 1.0; // Within range
    }

    private calculateDimensionMatch(candidate: CandidateSummary, intent: any): number {
        let scores: number[] = [];

        if (intent.preferredWidth && candidate.width) {
            const diff = Math.abs(candidate.width - intent.preferredWidth) / intent.preferredWidth;
            scores.push(Math.max(0, 1 - diff * 2)); // Strictness multiplier
        }
        if (intent.preferredHeight && candidate.height) {
            const diff = Math.abs(candidate.height - intent.preferredHeight) / intent.preferredHeight;
            scores.push(Math.max(0, 1 - diff * 2));
        }
        if (intent.preferredDepth && candidate.depth) {
            const diff = Math.abs(candidate.depth - intent.preferredDepth) / intent.preferredDepth;
            scores.push(Math.max(0, 1 - diff * 2));
        }

        if (scores.length === 0) return 0.5; // neutral
        return scores.reduce((a, b) => a + b, 0) / scores.length;
    }
}
