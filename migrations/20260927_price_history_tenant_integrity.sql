-- Close tenant isolation for legacy price_history rows.
-- Backfill ownership from the authoritative watchlist relation, then enforce it
-- at the database boundary so application queries cannot create cross-tenant rows.

ALTER TABLE price_history
  ADD COLUMN IF NOT EXISTS user_id UUID;

UPDATE price_history ph
SET user_id = w.user_id
FROM shopping_watchlists w
WHERE w.id = ph.watchlist_id
  AND ph.user_id IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM price_history ph
    LEFT JOIN shopping_watchlists w ON w.id = ph.watchlist_id
    WHERE w.id IS NULL OR ph.user_id IS NULL
  ) THEN
    RAISE EXCEPTION 'price_history contains rows without a valid watchlist owner';
  END IF;
END $$;

ALTER TABLE price_history
  ALTER COLUMN user_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS price_history_id_user_unique
  ON price_history(id, user_id);

ALTER TABLE price_history
  DROP CONSTRAINT IF EXISTS price_history_watchlist_user_fk;

ALTER TABLE price_history
  ADD CONSTRAINT price_history_watchlist_user_fk
  FOREIGN KEY (watchlist_id, user_id)
  REFERENCES shopping_watchlists(id, user_id)
  ON DELETE CASCADE;
