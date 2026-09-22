import { ShoppingCandidate, ShoppingIntent, normalizeIntent } from "../domain/shopping.js";

export type ShoppingPlan = { intent: ShoppingIntent; candidates: ShoppingCandidate[] };

export function rankCandidates(candidates: ShoppingCandidate[], intent: ShoppingIntent) {
  const budget = intent.budget;
  return [...candidates]
    .map((c) => {
      let score = Number(c.score ?? 0);
      if (budget != null && c.price != null) score += c.price <= budget ? 20 : -Math.min(20, ((c.price - budget) / Math.max(budget, 1)) * 20);
      if (intent.query && c.title.toLowerCase().includes(intent.query.toLowerCase())) score += 10;
      return { ...c, score: Math.round(score * 100) / 100 };
    })
    .sort((a,b) => (b.score ?? 0) - (a.score ?? 0));
}

export async function planShopping(input: ShoppingIntent & { candidates?: ShoppingCandidate[] }): Promise<ShoppingPlan> {
  const intent = normalizeIntent(input);
  return { intent, candidates: rankCandidates(input.candidates ?? [], intent) };
}