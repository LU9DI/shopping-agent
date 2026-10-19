import test from "node:test";
import assert from "node:assert/strict";
import { watchlistCreationErrorResponse } from "../src/domain/watchlistErrors.js";

test("maps watchlist entitlement limit to HTTP 429 with limit details", () => {
  assert.deepEqual(
    watchlistCreationErrorResponse({ code: "ENTITLEMENT_LIMIT", feature: "watchlists", limit: 10 }),
    { status: 429, body: { error: "watchlist plan limit reached", feature: "watchlists", limit: 10 } },
  );
});

test("does not misclassify unrelated failures as entitlement limits", () => {
  assert.equal(watchlistCreationErrorResponse(new Error("database unavailable")), null);
  assert.equal(watchlistCreationErrorResponse({ code: "DB_ERROR" }), null);
  assert.equal(watchlistCreationErrorResponse(null), null);
});

test("omits malformed optional entitlement metadata", () => {
  assert.deepEqual(
    watchlistCreationErrorResponse({ code: "ENTITLEMENT_LIMIT", feature: 7, limit: "10" }),
    { status: 429, body: { error: "watchlist plan limit reached" } },
  );
});
