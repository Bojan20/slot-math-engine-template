-- W215 Faza 1300.0 Agent C — Support ticketing.
--
-- One row per customer-raised ticket. The `escalations` and `comments`
-- JSONB columns are append-only and rarely exceed a few KB.
-- SLA deadlines are computed at insert time from severity + created_at.

CREATE TABLE IF NOT EXISTS support_tickets (
  id                  UUID         PRIMARY KEY,
  tenant_id           VARCHAR(64)  NOT NULL,
  raised_by           VARCHAR(320) NOT NULL,
  title               VARCHAR(200) NOT NULL,
  description         TEXT         NOT NULL,
  severity            VARCHAR(4)   NOT NULL CHECK (severity IN ('P0','P1','P2','P3')),
  category            VARCHAR(40)  NOT NULL CHECK (category IN ('bug','question','feature_request','billing')),
  status              VARCHAR(40)  NOT NULL DEFAULT 'open'
                                  CHECK (status IN ('open','in_progress','waiting_customer','resolved','closed')),
  assignee            VARCHAR(320) NOT NULL,
  sla_deadline        TIMESTAMPTZ  NOT NULL,
  first_response_at   TIMESTAMPTZ          DEFAULT NULL,
  escalations         JSONB        NOT NULL DEFAULT '[]'::jsonb,
  comments            JSONB        NOT NULL DEFAULT '[]'::jsonb,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  resolved_at         TIMESTAMPTZ          DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_tenant     ON support_tickets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_severity   ON support_tickets(severity);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status     ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_assignee   ON support_tickets(assignee);
CREATE INDEX IF NOT EXISTS idx_support_tickets_sla        ON support_tickets(sla_deadline)
  WHERE first_response_at IS NULL;
