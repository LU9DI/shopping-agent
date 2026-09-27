CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_app_users_email ON app_users(email);

CREATE TABLE IF NOT EXISTS shopping_plans (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  budget NUMERIC(12,2),
  currency TEXT NOT NULL DEFAULT 'BRL',
  preferences JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shopping_plans_user ON shopping_plans(user_id,created_at DESC);

CREATE TABLE IF NOT EXISTS shopping_watchlists (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  query TEXT NOT NULL,
  budget NUMERIC(12,2),
  target_price NUMERIC(12,2),
  currency TEXT NOT NULL DEFAULT 'BRL',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shopping_watchlists_user ON shopping_watchlists(user_id,created_at DESC);

CREATE TABLE IF NOT EXISTS price_history (
  id UUID PRIMARY KEY,
  watchlist_id UUID NOT NULL,
  user_id UUID NOT NULL,
  merchant TEXT,
  price NUMERIC(14,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'BRL',
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (watchlist_id, user_id) REFERENCES shopping_watchlists(id, user_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS price_history_id_user_unique ON price_history(id,user_id);
CREATE INDEX IF NOT EXISTS idx_price_history_watchlist_checked ON price_history(watchlist_id,checked_at DESC);

CREATE TABLE IF NOT EXISTS shopping_price_checks (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  watchlist_id UUID NOT NULL REFERENCES shopping_watchlists(id) ON DELETE CASCADE,
  price NUMERIC(12,2) NOT NULL CHECK(price >= 0),
  merchant TEXT,
  url TEXT,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_price_checks_watchlist_time ON shopping_price_checks(watchlist_id,checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_price_checks_user_time ON shopping_price_checks(user_id,checked_at DESC);

CREATE TABLE IF NOT EXISTS shopping_price_alerts (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  watchlist_id UUID NOT NULL REFERENCES shopping_watchlists(id) ON DELETE CASCADE,
  price_check_id UUID NOT NULL UNIQUE REFERENCES shopping_price_checks(id) ON DELETE CASCADE,
  target_price NUMERIC(12,2) NOT NULL,
  price NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_price_alerts_user_time ON shopping_price_alerts(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_price_alerts_watchlist_time ON shopping_price_alerts(watchlist_id,created_at DESC);