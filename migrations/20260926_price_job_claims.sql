ALTER TABLE shopping_check_jobs
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS claimed_by TEXT,
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error_code TEXT,
  ADD COLUMN IF NOT EXISTS last_error_message TEXT;

UPDATE shopping_check_jobs
SET attempt_count = GREATEST(attempt_count, attempts)
WHERE attempt_count < attempts;

ALTER TABLE shopping_check_jobs
  DROP CONSTRAINT IF EXISTS shopping_check_jobs_status_check;

ALTER TABLE shopping_check_jobs
  ADD CONSTRAINT shopping_check_jobs_status_check
  CHECK (status IN ('queued','running','succeeded','failed','dead'));

CREATE INDEX IF NOT EXISTS shopping_check_jobs_claim_idx
  ON shopping_check_jobs(status, next_attempt_at, created_at)
  WHERE status = 'queued';

CREATE INDEX IF NOT EXISTS shopping_check_jobs_stale_claim_idx
  ON shopping_check_jobs(status, claimed_at)
  WHERE status = 'running';

CREATE INDEX IF NOT EXISTS shopping_check_jobs_worker_idx
  ON shopping_check_jobs(claimed_by, claimed_at)
  WHERE status = 'running';
