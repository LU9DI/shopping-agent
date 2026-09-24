ALTER TABLE IF EXISTS price_history DROP CONSTRAINT IF EXISTS price_history_watchlist_id_fkey;
ALTER TABLE IF EXISTS price_history ADD CONSTRAINT price_history_watchlist_id_fkey FOREIGN KEY (watchlist_id) REFERENCES shopping_watchlists(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS alert_rules DROP CONSTRAINT IF EXISTS alert_rules_watchlist_id_fkey;
ALTER TABLE IF EXISTS alert_rules ADD CONSTRAINT alert_rules_watchlist_id_fkey FOREIGN KEY (watchlist_id) REFERENCES shopping_watchlists(id) ON DELETE CASCADE;