-- v2 da constraint de vigência (auditoria 2.9).
--
-- A v1 (EXCLUDE por tributo+jurisdição+vigência) PROIBIA a sobreposição que
-- a resolução por especificidade (ADR-005) existe para resolver: o seed
-- perdeu 11 de 98 regras ACTIVE em silêncio (.onConflictDoNothing cobre
-- exclusão), e o Postgres "de produção" calculava diferente da memória.
--
-- Nova política: vigências disjuntas são garantidas POR REGRA (versões do
-- mesmo id não se sobrepõem). Sobreposição ENTRE regras distintas do mesmo
-- tributo é legítima — o resolver decide; a checagem de conflito real
-- (mesmo escopo E mesma condição) pertence ao workflow de ativação.
--
-- Idempotente: dropa a v1 se existir e cria a v2 apenas se ausente.

ALTER TABLE tax_rules DROP CONSTRAINT IF EXISTS tax_rules_no_overlap;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tax_rules_version_overlap'
  ) THEN
    ALTER TABLE tax_rules
      ADD CONSTRAINT tax_rules_version_overlap
      EXCLUDE USING gist (id WITH =, validity WITH &&);
  END IF;
END $$;
