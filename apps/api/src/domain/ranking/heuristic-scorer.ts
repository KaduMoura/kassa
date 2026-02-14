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
}
