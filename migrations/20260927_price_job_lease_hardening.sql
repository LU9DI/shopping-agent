ALTER TABLE shopping_check_jobs
  ADD COLUMN IF NOT EXISTS claim_token UUID,
  ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS shopping_check_jobs_claim_token_uidx
  ON shopping_check_jobs(claim_token)
  WHERE claim_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS shopping_check_jobs_lease_idx
  ON shopping_check_jobs(status, lease_expires_at)
  WHERE status = 'running';
