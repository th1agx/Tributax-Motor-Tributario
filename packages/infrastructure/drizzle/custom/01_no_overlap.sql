-- DEPRECATED (auditoria 2.9): a constraint original (tributo+jurisdição+
-- vigência disjuntas) proibia a sobreposição que a resolução por
-- especificidade (ADR-005) resolve — o seed perdia regras em silêncio.
-- Substituída por 04_no_overlap_v2.sql (vigências disjuntas POR REGRA).
-- Este arquivo permanece apenas para compatibilidade de rollforward;
-- não cria nada.

SELECT 1;
