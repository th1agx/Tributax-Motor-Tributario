# ADR-015 — CBS/IBS: alíquotas-teste do período transatório

- Status: ACEITO
- Data: 2026-09-19

## Contexto

A LC 214/2025 cria o IBS (estadual-municipal, partilha destino) e a CBS
(federal) substituindo PIS/COFINS e ICMS ao longo de 2026–2033. Em 2026 vigoram
alíquotas-teste (CBS 0,9%, IBS 0,1%) compensáveis com os tributos atuais.
Ignorar a transição deixaria o motor cego para o cenário fiscal dominante da
década; catalogar tudo de uma vez seria inventar além da fonte.

## Decisão

1. **Catálogo cobre apenas 2026** com vigência explícita `[2026-01-01, 2027-01-01)`.
   De 2027 em diante o motor responde `NO_RULE_FOUND` até a LC/MP de cada ano
   ser curada — vigência jamais é extrapolada pelo motor (ADR-003/004).
2. **Fato gerador simplificado**: regimes NORMAL/LUCRO_REAL/LUCRO_PRESUMIDO
   (contribuintes dos tributos substituídos). Simples/MEI não pagam
   alíquotas-teste em 2026 — sem regra, honesto.
3. **Lacunas declaradas em reviewReason**: compensação CBS×PIS/COFINS e split
   payment do IBS (opcional em 2026, obrigatório a partir de 2027) ficam como
   NEEDS_REVIEW — viram fila de trabalho do LegislationWatch.
4. **IBS com jurisdição STATE** (arrecadação 100% destino) e CBS FEDERAL —
   o modelo de jurisdição existente suporta ambos sem mudança.

## Alternativas

1. Modelar a transição completa 2026–2033 já agora — rejeitado: alíquotas
   futuras ainda dependem de regulamentação; catalogá-las seria invenção.
2. Ignorar IBS/CBS até 2033 — rejeitado: clientes emitem hoje em 2026 e as
   alíquotas-teste são obrigatórias para os contribuintes dos tributos
   substituídos.

## Consequências

- (+) O motor responde 2026 corretamente e vira referência na transição —
  diferencial comercial (poucos sistemas tratam IBS/CBS).
- (+) `NO_RULE_FOUND` em 2027 é um gatilho natural para a curadoria anual.
- (-) Curadoria anual obrigatória (alíquota muda a cada ano até 2031).
