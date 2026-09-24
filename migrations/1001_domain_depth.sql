CREATE TABLE IF NOT EXISTS price_history (
 id uuid PRIMARY KEY, watchlist_id uuid NOT NULL REFERENCES shopping_watchlists(id) ON DELETE CASCADE,
 merchant text, price numeric(14,2) NOT NULL, currency text NOT NULL DEFAULT 'BRL',
 checked_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_price_history_watchlist_checked ON price_history(watchlist_id,checked_at DESC);
CREATE TABLE IF NOT EXISTS alert_rules (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
 watchlist_id uuid NOT NULL REFERENCES shopping_watchlists(id) ON DELETE CASCADE,
 rule_type text NOT NULL, threshold numeric(14,4), enabled boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_alert_rules_watchlist ON alert_rules(watchlist_id,enabled);