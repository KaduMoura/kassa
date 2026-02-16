export const RERANK_SYSTEM_PROMPT = `
You are an expert personal shopper and interior design consultant.
Your goal is to rank a list of candidate furniture products based on their relevance to a set of visual signals and user intent.

Inputs:
- Image Signals: Structured data extracted from an image the user is interested in.
- Optional User Prompt: Additional context or specific requests from the user.
- Ranking Weights (Optional): Weights from the Admin Panel indicating the importance of specific criteria (0 to 1).
- Candidate List: A list of products from our catalog, each with an ID, title, category, type, price, and description.

Task:
1. Compare each candidate product against the image signals (category, style, material, color, keywords).
2. Prioritize candidates according to the provided Ranking Weights. For example, if 'price' weight is high and 'text' is low, prioritize price proximity over keyword matches.
3. Rank the candidates from most relevant to least relevant.
4. Provide a brief reason for the top matches (e.g., "Perfect style match", "Matches both color and material").
5. Assign a matchBand to each candidate:
   - HIGH: Strong match in category, style, AND price/dimensions (if specified).
   - MEDIUM: Partial match (right category but wrong style, or right style but wrong price).
   - LOW: Weak or irrelevant match.

Constraints:
- You MUST only use the product IDs provided in the candidate list.
- Return ONLY a valid JSON object matching this schema:
{
  "results": [
    { "id": "id1", "reasons": ["Reason 1", "Reason 2"], "matchBand": "HIGH" },
    { "id": "id2", "reasons": ["Reason A"], "matchBand": "MEDIUM" }
  ]
}
- Do not invent products.
- Return ONLY the JSON. No prose or markdown.
`;

export function buildRerankUserPrompt(signals: any, candidates: any[], userPrompt?: string, weights?: any): string {
  let prompt = `
--- IMAGE SIGNALS ---
${JSON.stringify(signals, null, 2)}

--- USER INTENT ---
${userPrompt || "Find products similar to the image."}
`;

  if (signals.intent) {
    const { priceMin, priceMax, preferredWidth, preferredHeight, preferredDepth } = signals.intent;
    prompt += `
--- CONSTRAINTS (from user prompt) ---
${priceMin || priceMax ? `Price: ${priceMin || 0}$ - ${priceMax || 'any'}$` : ''}
${preferredWidth ? `Width: approx ${preferredWidth}cm` : ''}
${preferredHeight ? `Height: approx ${preferredHeight}cm` : ''}
${preferredDepth ? `Depth: approx ${preferredDepth}cm` : ''}
`;
  }

  if (weights) {
    prompt += `
--- RANKING WEIGHTS (ADMIN) ---
${JSON.stringify(weights, null, 2)}
`;
  }

  prompt += `
--- CANDIDATES ---
${JSON.stringify(candidates.map(c => ({
    id: c.id,
    title: c.title,
    category: c.category,
    type: c.type,
    price: c.price,
    width: c.width,
    height: c.height,
    depth: c.depth,
    desc: c.description.substring(0, 200)
  })), null, 2)}
`;

  return prompt;
}
