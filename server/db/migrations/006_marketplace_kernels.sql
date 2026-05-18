-- CORTI W209 Faza 500.0 — Marketplace Activation.
-- Submitted kernels table. Each row is an author submission going
-- through pending → testing → approved/rejected → active. `code` keeps
-- the IR source inline for in-memory dev; in production this is an S3
-- pointer in `storage_url` and `code` is left NULL.

CREATE TABLE IF NOT EXISTS marketplace_kernels (
  id                   UUID         PRIMARY KEY,
  author_id            UUID         NOT NULL,
  manifest             JSONB        NOT NULL DEFAULT '{}'::jsonb,
  code                 TEXT,
  storage_url          VARCHAR(512),
  submission_status    VARCHAR(32)  NOT NULL DEFAULT 'pending',
  test_verdict         JSONB,
  certification_level  VARCHAR(32)  NOT NULL DEFAULT 'none',
  install_count        BIGINT       NOT NULL DEFAULT 0,
  price_usd            DOUBLE PRECISION NOT NULL DEFAULT 0,
  license_type         VARCHAR(32)  NOT NULL DEFAULT 'perpetual',
  lw_gap               VARCHAR(32),
  p_id                 VARCHAR(32),
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mkt_kernels_author ON marketplace_kernels(author_id);
CREATE INDEX IF NOT EXISTS idx_mkt_kernels_status ON marketplace_kernels(submission_status);
CREATE INDEX IF NOT EXISTS idx_mkt_kernels_lw_gap ON marketplace_kernels(lw_gap);
CREATE INDEX IF NOT EXISTS idx_mkt_kernels_p_id   ON marketplace_kernels(p_id);
