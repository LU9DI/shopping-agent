ALTER TABLE price_history ADD COLUMN IF NOT EXISTS previous_price numeric(14,2);
ALTER TABLE price_history ADD COLUMN IF NOT EXISTS price_check_id uuid;
ALTER TABLE price_history ADD COLUMN IF NOT EXISTS delta numeric(14,2);
ALTER TABLE price_history ADD COLUMN IF NOT EXISTS delta_percent numeric(12,4);

CREATE INDEX IF NOT EXISTS idx_price_history_watchlist_checked_id
  ON price_history(watchlist_id, checked_at DESC, id);

CREATE TABLE IF NOT EXISTS alert_events (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  watchlist_id uuid NOT NULL REFERENCES shopping_watchlists(id) ON DELETE CASCADE,
  alert_rule_id uuid NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
  price_check_id uuid,
  rule_type text NOT NULL,
  threshold numeric(14,4),
  previous_price numeric(14,2),
  current_price numeric(14,2) NOT NULL,
  delta numeric(14,2),
  delta_percent numeric(12,4),
  dedupe_window_start timestamptz NOT NULL,
  reason jsonb NOT NULL DEFAULT '{}'::jsonb,
  triggered_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_alert_events_rule_window
  ON alert_events(alert_rule_id, dedupe_window_start);

CREATE INDEX IF NOT EXISTS idx_alert_events_watchlist_triggered
  ON alert_events(watchlist_id, triggered_at DESC);

CREATE INDEX IF NOT EXISTS idx_alert_events_price_check
  ON alert_events(price_check_id);

ALTER TABLE shopping_price_alerts
  ADD COLUMN IF NOT EXISTS alert_rule_id uuid REFERENCES alert_rules(id) ON DELETE SET NULL;
