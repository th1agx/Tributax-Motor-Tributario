# ADR-013 — Coletor legislativo e pipeline RAG

- Status: ACEITO
- Data: 2026-09-19

## Contexto

O ADR-012 definiu o LegislationWatch e a invariante "IA propõe, humano aprova",
mas o elo de coleta não existe: o agente recebe um `watch-report.json` escrito
à mão. A visão do produto é um pipeline LLM + RAG que varre fontes primárias
(DOU, diários estaduais/municipais, SEFAZ), entende as normas e alimenta o
diff contra o catálogo — sem que a LLM escreva regra livre.

## Decisão

Novo contexto `packages/collector` (`@tributax/collector`), consumidor da API
pública como qualquer cliente externo, com pipeline em 5 estágios:

```
coletar → armazenar (imutável) → chunkar → embedding → recuperar → extrair
```

1. **Coletores como ports** (`NormCollector`): cada fonte é um adapter.
   `RssCollector` genérico (RSS/Atom, sem dependências) cobre a maioria dos
   diários e SEFAZs; `DouCollector` consulta a API pública do DOU. Toda norma
   coletada carrega URL e data de publicação — a **evidência** primária.
2. **Store imutável** (`NormStore`): normas e chunks são append-only,
   idempotentes por hash de conteúdo. Re-executar o coletor nunca duplica.
3. **RAG com pgvector adiável**: embeddings atrás do port `EmbeddingProvider`
   (adapter OpenAI-compatível + `FakeEmbeddingProvider` determinístico para
   testes/offline). A recuperação é similaridade de cosseno sobre chunks;
   começar em memória é aceitável, migrar para pgvector é evolução do adapter,
   não do pipeline.
4. **Extração com guardrails** (`ObservationExtractor`): a LLM recebe APENAS
   chunks recuperados e produz `WatchObservation` estruturadas (mesmo contrato
   que o `diffCatalog` já consome). Anti-alucinação em três camadas:
   - a observação só é aceita se a alíquota citada **aparece no texto** do
     chunk (validação numérica, não de confiança);
   - a fonte da observação é sempre a URL da norma de origem do chunk — a LLM
     não escolhe fontes;
   - observações rejeitadas viram `rejections` com motivo, nunca descartadas
     em silêncio.
5. **Orquestrador** (`runWatchCycle`): dado um alvo de monitoração
   (tributo/jurisdição), executa o pipeline e emite um `WatchReport` — o mesmo
   formato que o `watch-agent.cli.ts` existente já envia à API. A CLI nova
   (`rag-watch.cli.ts`) encadeia os dois: gera o report e o aplica.

## Alternativas consideradas

1. LLM lendo a internet diretamente (function calling livre) — rejeitado:
   sem fonte citada e validável, todo resultado seria não-auditável.
2. Extração por regex/heurística pura — mantida como piso implícito dos
   guardrails, mas insuficiente para a variedade de redações normativas.
3. RAG sobre todo o texto legal desde 1988 — rejeitado por agora; o alvo de
   monitoração (tributo × jurisdição) filtra a ingestão desde a origem.

## Consequências

- (+) O LegislationWatch fecha o ciclo: fonte primária → observação → diff →
  proposta DRAFT → triagem humana.
- (+) Nenhuma dependência nova em runtime (fetch nativo do Node 22); LLM e
  embeddings são configuração, não acoplamento.
- (+) Testável offline de ponta a ponta com providers fake determinísticos.
- (-) A qualidade do RAG depende do chunking e do modelo — mitigado pelos
  guardrails numéricos e pela revisão humana obrigatória (ADR-012).
- (-) Endpoints de fontes (DOU/diários) mudam sem aviso; adapters isolados
  por fonte limitam o raio de manutenção.
