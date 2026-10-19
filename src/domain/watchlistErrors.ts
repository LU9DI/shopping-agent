export type WatchlistCreationErrorResponse = {
  status: number;
  body: { error: string; feature?: string; limit?: number };
};

export function watchlistCreationErrorResponse(error: unknown): WatchlistCreationErrorResponse | null {
  if (!error || typeof error !== "object") return null;
  const candidate = error as { code?: unknown; feature?: unknown; limit?: unknown };
  if (candidate.code !== "ENTITLEMENT_LIMIT") return null;
  return {
    status: 429,
    body: {
      error: "watchlist plan limit reached",
      ...(typeof candidate.feature === "string" ? { feature: candidate.feature } : {}),
      ...(typeof candidate.limit === "number" ? { limit: candidate.limit } : {}),
    },
  };
}
