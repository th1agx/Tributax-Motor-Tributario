# ADR-012 — Monitoração legislativa por agentes de IA

- Status: ACEITO (design; implementação em fase futura)
- Data: 2026-09-18

## Contexto

Legislação tributária muda constantemente (convênios, decretos estaduais,
resoluções, LC 214/25 regulamentando IBS/CBS). Curadoria manual não escala.
Quer-se agendar agentes de IA que, por exemplo semanalmente, verifiquem se
tributações/alíquotas mudaram e **atualizem campos ou notifiquem**.

## Decisão

**Agentes de IA operam como proponentes, nunca como aprovadores.**

1. **Fluxo:** agente varre fontes (DOU, diários oficiais estaduais/municipais,
   sites de SEFAZ, portais de convênios) em agenda (ex.: semanal), compara o
   que encontra com o catálogo vigente e produz:
   - `LegislationAlert` (notificação: "possível mudança em X") — sempre; e/ou
   - **proposta** de nova `TaxRule` em status `DRAFT` com `origin: AI_SUGGESTED`,
     fundamento legal citado e vigência extraída da norma.
2. **Invariante inegociável:** nenhuma proposta de IA chega a `ACTIVE` sem
   revisão humana (workflow DRAFT → REVIEW → APPROVED → ACTIVE, já modelado).
   IA não altera regra vigente, não estende vigência retroativamente, não
   desativa regra. Ela pode, no máximo, **sugerir tudo isso**.
3. **Confiança e rastreio:** toda proposta carrega fonte(s) primária(s)
   (URL, data de publicação, ementa), grau de confiança e o diff exato contra
   o catálogo. Propostas ficam em fila com SLA de triagem.
4. **Notificação:** alerts são publicados em canal configurável (dashboard,
   e-mail, webhook) — "avisar em algum lugar" é o piso; a atualização do
   campo é o teto, sempre mediado por aprovação.
5. **Sintonia com NEEDS_REVIEW:** onde o catálogo já marca incerteza
   (`reviewReason`), o agente prioriza a verificação — o campo vira a fila
   de trabalho dele.

## Alternativas

1. IA com poder de escrita direta em regras — rejeitado: um alucínio viraria
   cálculo fiscal em produção. O custo de um falso negativo (alerta perdido)
   é muito menor que o de um falso positivo aplicado.
2. Só monitoramento manual/periódico humano — não escala com 27 UFs + União +
   ~5.570 municípios.

## Consequências

- (+) Curadoria assistida desde cedo; catálogo envelhece mais devagar.
- (+) O produto ganha um diferencial comercial ("seu catálogo se mantém
  atualizado, com auditoria humana").
- (-) Infra de agentes (agendamento, fontes, parsing) é um contexto próprio
  (`LegislationWatch`) — extraível, consumidor do `RuleCatalog` via port.
- (-) Custo de triagem humana das propostas — mitigado por confiança, diff
  claro e deduplicação.

## Pontos de extensão já reservados no domínio

- `TaxRule.origin` inclui `AI_SUGGESTED`;
- `TaxRule.reviewReason` (NEEDS_REVIEW + motivo) em qualquer status;
- tipos `LegislationAlert`/`LegislationDiff` no contexto `LegislationWatch`;
- agendamento e execução do agente vivem FORA do core (adapter/scheduler),
  chamando o `RuleCatalog` por port — o motor de decisão nunca conhece a IA.
