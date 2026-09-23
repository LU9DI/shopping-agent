ALTER TABLE shopping_price_checks ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS shopping_price_checks_user_idempotency_idx
  ON shopping_price_checks(user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
