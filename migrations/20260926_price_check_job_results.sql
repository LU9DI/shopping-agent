ALTER TABLE shopping_price_checks
  ADD COLUMN IF NOT EXISTS source_job_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS shopping_price_checks_source_job_uidx
  ON shopping_price_checks(source_job_id)
  WHERE source_job_id IS NOT NULL;
