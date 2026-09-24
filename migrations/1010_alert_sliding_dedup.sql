DROP INDEX IF EXISTS uq_alert_events_rule_window;
CREATE INDEX IF NOT EXISTS idx_alert_events_rule_triggered ON alert_events(alert_rule_id, triggered_at DESC);