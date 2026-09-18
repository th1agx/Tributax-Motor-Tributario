-- Constraints de vigência disjunta (ADR-003).
-- Aplicar após as migrations geradas pelo drizzle-kit:
--   psql "$DATABASE_URL" -f drizzle/custom/01_no_overlap.sql

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Regras ATIVAS do mesmo tributo, na mesma jurisdição, não podem ter
-- vigências sobrepostas — invariante do catálogo garantida no dado.
ALTER TABLE tax_rules
  ADD CONSTRAINT tax_rules_no_overlap
  EXCLUDE USING gist (
    tribute WITH =,
    jurisdiction_scope WITH =,
    COALESCE(jurisdiction_code, '') WITH =,
    validity WITH &&
  ) WHERE (status = 'ACTIVE');
