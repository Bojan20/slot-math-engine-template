-- W214 Faza 800.1 Agent C — Public marketing site lead capture.
--
-- One row per signup-form submission from the public marketing site.
-- Leads are global (NOT multi-tenant) — they feed a single sales queue.
-- Per-lead enrichment (operator tier, sales-rep routing) happens at
-- insert time on the application side and is stored alongside the raw
-- form payload.

CREATE TABLE IF NOT EXISTS marketing_leads (
  lead_id          UUID         PRIMARY KEY,
  name             VARCHAR(200) NOT NULL,
  email            VARCHAR(320) NOT NULL,
  company          VARCHAR(200) NOT NULL,
  role             VARCHAR(20)  NOT NULL,
  message          TEXT         NOT NULL DEFAULT '',
  operator_tier    VARCHAR(20)  NOT NULL DEFAULT 'unknown',
  remote_ip        VARCHAR(45)  NOT NULL DEFAULT '0.0.0.0',
  received_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  tarball_sent_at  TIMESTAMPTZ           DEFAULT NULL,
  routed_to        VARCHAR(40)  NOT NULL DEFAULT 'inbound-queue'
);

CREATE INDEX IF NOT EXISTS idx_marketing_leads_email
  ON marketing_leads(email);
CREATE INDEX IF NOT EXISTS idx_marketing_leads_received
  ON marketing_leads(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketing_leads_tier
  ON marketing_leads(operator_tier);
CREATE INDEX IF NOT EXISTS idx_marketing_leads_unsent
  ON marketing_leads(tarball_sent_at)
  WHERE tarball_sent_at IS NULL;
