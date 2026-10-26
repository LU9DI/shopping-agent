export type ShoppingIntent = {
  query: string;
  budget?: number;
  currency?: string;
  preferences?: string[];
};

export type ShoppingCandidate = {
  title: string;
  url?: string;
  price?: number;
  merchant?: string;
  score?: number;
};

export function normalizeIntent(input: ShoppingIntent) {
  const query = String(input.query ?? "").trim();
  const budget =
    typeof input.budget === "number" &&
    Number.isFinite(input.budget) &&
    input.budget > 0
      ? input.budget
      : undefined;
  const preferences = (input.preferences ?? [])
    .map((preference) => String(preference).trim())
    .filter(Boolean)
    .slice(0, 20);

  return {
    query,
    budget,
    currency: String(input.currency ?? "BRL").trim() || "BRL",
    preferences,
  };
}
