CREATE UNIQUE INDEX IF NOT EXISTS shopping_watchlists_id_user_unique
  ON shopping_watchlists(id, user_id);

CREATE TABLE IF NOT EXISTS shopping_check_jobs (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  watchlist_id UUID NOT NULL,
  product_key TEXT NOT NULL,
  source TEXT NOT NULL,
  window_started_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, watchlist_id, product_key, source, window_started_at),
  FOREIGN KEY (watchlist_id, user_id) REFERENCES shopping_watchlists(id, user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS shopping_check_jobs_due_idx
  ON shopping_check_jobs(status, next_attempt_at);

CREATE INDEX IF NOT EXISTS shopping_check_jobs_scope_idx
  ON shopping_check_jobs(watchlist_id, product_key, status);

CREATE TABLE IF NOT EXISTS shopping_source_metrics (
  id BIGSERIAL PRIMARY KEY,
  source TEXT NOT NULL,
  success BOOLEAN NOT NULL,
  latency_ms INTEGER NOT NULL CHECK (latency_ms >= 0),
  attempts INTEGER NOT NULL CHECK (attempts > 0),
  error_code TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shopping_source_metrics_source_time_idx
  ON shopping_source_metrics(source, recorded_at DESC);
