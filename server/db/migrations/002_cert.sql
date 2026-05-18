-- CORTI W206-PERSISTENCE — cert submission storage.

CREATE TABLE IF NOT EXISTS cert_submissions (
  submission_id   VARCHAR(64) PRIMARY KEY,
  ir_blob         JSONB       NOT NULL,
  ir_sha256       CHAR(64)    NOT NULL,
  jurisdiction    VARCHAR(8)  NOT NULL,
  status          VARCHAR(16) NOT NULL,
  par_sheet       JSONB,
  par_pdf         BYTEA,
  par_pdf_sha256  CHAR(64),
  hsm_signature   JSONB,
  operator_package JSONB,
  submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_cert_status ON cert_submissions(status);
CREATE INDEX IF NOT EXISTS idx_cert_juris  ON cert_submissions(jurisdiction);
