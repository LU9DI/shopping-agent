CREATE TABLE IF NOT EXISTS shopping_source_registry (
  source TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  allowed_hosts TEXT[] NOT NULL DEFAULT '{}',
  max_concurrency INTEGER NOT NULL DEFAULT 2 CHECK (max_concurrency > 0 AND max_concurrency <= 100),
  min_interval_ms INTEGER NOT NULL DEFAULT 1000 CHECK (min_interval_ms >= 0),
  timeout_ms INTEGER NOT NULL DEFAULT 8000 CHECK (timeout_ms BETWEEN 1000 AND 30000),
  max_response_bytes INTEGER NOT NULL DEFAULT 1048576 CHECK (max_response_bytes BETWEEN 4096 AND 10485760),
  breaker_failure_threshold INTEGER NOT NULL DEFAULT 5 CHECK (breaker_failure_threshold BETWEEN 1 AND 100),
  breaker_cooldown_ms INTEGER NOT NULL DEFAULT 60000 CHECK (breaker_cooldown_ms BETWEEN 1000 AND 3600000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shopping_source_state (
  source TEXT PRIMARY KEY REFERENCES shopping_source_registry(source) ON DELETE CASCADE,
  consecutive_failures INTEGER NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  state TEXT NOT NULL DEFAULT 'closed' CHECK (state IN ('closed','open','half_open')),
  opened_at TIMESTAMPTZ,
  retry_at TIMESTAMPTZ,
  in_flight INTEGER NOT NULL DEFAULT 0 CHECK (in_flight >= 0),
  next_allowed_at TIMESTAMPTZ,
  last_error_code TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shopping_source_state_due_idx
  ON shopping_source_state(state, retry_at);

INSERT INTO shopping_source_registry
  (source,display_name,enabled,allowed_hosts,max_concurrency,min_interval_ms,timeout_ms,max_response_bytes,breaker_failure_threshold,breaker_cooldown_ms)
VALUES
  ('mercadolivre','Mercado Livre',false,ARRAY['mercadolivre.com.br','mercadolivre.com'],2,1000,8000,1048576,5,60000),
  ('amazon-br','Amazon Brasil',false,ARRAY['amazon.com.br'],2,1500,8000,1048576,5,60000)
ON CONFLICT (source) DO NOTHING;

INSERT INTO shopping_source_state(source)
SELECT source FROM shopping_source_registry
ON CONFLICT (source) DO NOTHING;
