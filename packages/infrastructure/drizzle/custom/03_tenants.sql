-- 03_tenants.sql (ADR-009): tenants — API key armazenada como hash sha256.

CREATE TABLE IF NOT EXISTS tenants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  key_hash    varchar(64) NOT NULL,
  rpm_quota   integer NOT NULL DEFAULT 0,  -- 0 = usar RATE_LIMIT_RPM global
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS tenants_key_hash ON tenants (key_hash);
