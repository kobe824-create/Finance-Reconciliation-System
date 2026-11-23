BEGIN;

CREATE TYPE user_role AS ENUM ('admin', 'preparer', 'reviewer', 'auditor');
CREATE TYPE reconciliation_status AS ENUM ('draft', 'in_review', 'approved', 'needs_attention');
CREATE TYPE transaction_source AS ENUM ('bank', 'ledger');

CREATE TABLE app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role user_role NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  institution TEXT NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'RWF',
  account_number_masked TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE reconciliations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  statement_balance NUMERIC(18, 2) NOT NULL,
  book_balance NUMERIC(18, 2) NOT NULL,
  status reconciliation_status NOT NULL DEFAULT 'draft',
  preparer_id UUID NOT NULL REFERENCES app_users(id),
  reviewer_id UUID REFERENCES app_users(id),
  reviewer_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (period_start <= period_end),
  UNIQUE (account_id, period_start, period_end)
);
CREATE INDEX reconciliations_period_idx ON reconciliations(period_start DESC, period_end DESC);
CREATE INDEX reconciliations_status_idx ON reconciliations(status, updated_at DESC);

CREATE TABLE source_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reconciliation_id UUID NOT NULL REFERENCES reconciliations(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  source transaction_source NOT NULL,
  content_type TEXT NOT NULL,
  file_size INTEGER NOT NULL CHECK (file_size BETWEEN 0 AND 2621440),
  sha256 CHAR(64) NOT NULL,
  row_count INTEGER NOT NULL DEFAULT 0 CHECK (row_count >= 0),
  import_complete BOOLEAN NOT NULL DEFAULT FALSE,
  original_content BYTEA NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES app_users(id),
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (reconciliation_id, source, sha256)
);
CREATE INDEX source_files_reconciliation_idx ON source_files(reconciliation_id, imported_at DESC);

CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reconciliation_id UUID NOT NULL REFERENCES reconciliations(id) ON DELETE CASCADE,
  source_file_id UUID REFERENCES source_files(id) ON DELETE SET NULL,
  source transaction_source NOT NULL,
  source_row_number INTEGER NOT NULL CHECK (source_row_number >= 0),
  transaction_date DATE NOT NULL,
  description TEXT NOT NULL,
  reference TEXT,
  amount NUMERIC(18, 2) NOT NULL,
  currency CHAR(3) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX transactions_reconciliation_date_idx ON transactions(reconciliation_id, transaction_date);
CREATE INDEX transactions_reference_idx ON transactions(reference);
CREATE UNIQUE INDEX transactions_source_row_idx ON transactions(source_file_id, source_row_number);

CREATE TABLE match_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reconciliation_id UUID NOT NULL REFERENCES reconciliations(id) ON DELETE CASCADE,
  bank_transaction_id UUID NOT NULL UNIQUE REFERENCES transactions(id) ON DELETE CASCADE,
  ledger_transaction_id UUID NOT NULL UNIQUE REFERENCES transactions(id) ON DELETE CASCADE,
  match_method TEXT NOT NULL CHECK (match_method IN ('reference', 'description', 'manual')),
  matched_by UUID NOT NULL REFERENCES app_users(id),
  matched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (bank_transaction_id <> ledger_transaction_id)
);
CREATE INDEX match_sets_reconciliation_idx ON match_sets(reconciliation_id, matched_at DESC);

CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID NOT NULL REFERENCES app_users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_created_idx ON audit_log(created_at DESC);
CREATE INDEX audit_log_entity_idx ON audit_log(entity_type, entity_id, created_at DESC);

CREATE TABLE auth_attempts (
  id BIGSERIAL PRIMARY KEY,
  email_key CHAR(64) NOT NULL,
  ip_key CHAR(64) NOT NULL,
  succeeded BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX auth_attempts_recent_idx ON auth_attempts(email_key, ip_key, created_at DESC) WHERE succeeded = FALSE;
CREATE INDEX auth_attempts_created_idx ON auth_attempts(created_at);

CREATE FUNCTION prevent_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$;
CREATE TRIGGER audit_log_no_update BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();

COMMIT;
