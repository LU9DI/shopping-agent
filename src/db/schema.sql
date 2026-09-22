CREATE TABLE IF NOT EXISTS app_users (id UUID PRIMARY KEY,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now());
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
CREATE INDEX IF NOT EXISTS idx_shopping_plans_user ON shopping_plans(user_id, created_at DESC);