DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM shopping_price_checks pc
    LEFT JOIN shopping_watchlists w ON w.id = pc.watchlist_id AND w.user_id = pc.user_id
    WHERE w.id IS NULL
  ) THEN RAISE EXCEPTION 'shopping_price_checks contains cross-user watchlist references'; END IF;
  IF EXISTS (
    SELECT 1 FROM shopping_price_alerts a
    LEFT JOIN shopping_watchlists w ON w.id = a.watchlist_id AND w.user_id = a.user_id
    LEFT JOIN shopping_price_checks pc ON pc.id = a.price_check_id AND pc.user_id = a.user_id
    WHERE w.id IS NULL OR pc.id IS NULL
  ) THEN RAISE EXCEPTION 'shopping_price_alerts contains cross-user references'; END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS shopping_watchlists_id_user_unique ON shopping_watchlists(id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS shopping_price_checks_id_user_unique ON shopping_price_checks(id, user_id);

ALTER TABLE shopping_price_checks DROP CONSTRAINT IF EXISTS shopping_price_checks_watchlist_user_fk;
ALTER TABLE shopping_price_checks ADD CONSTRAINT shopping_price_checks_watchlist_user_fk
  FOREIGN KEY (watchlist_id, user_id) REFERENCES shopping_watchlists(id, user_id) ON DELETE CASCADE;

ALTER TABLE shopping_price_alerts DROP CONSTRAINT IF EXISTS shopping_price_alerts_watchlist_user_fk;
ALTER TABLE shopping_price_alerts ADD CONSTRAINT shopping_price_alerts_watchlist_user_fk
  FOREIGN KEY (watchlist_id, user_id) REFERENCES shopping_watchlists(id, user_id) ON DELETE CASCADE;

ALTER TABLE shopping_price_alerts DROP CONSTRAINT IF EXISTS shopping_price_alerts_price_check_user_fk;
ALTER TABLE shopping_price_alerts ADD CONSTRAINT shopping_price_alerts_price_check_user_fk
  FOREIGN KEY (price_check_id, user_id) REFERENCES shopping_price_checks(id, user_id) ON DELETE CASCADE;
