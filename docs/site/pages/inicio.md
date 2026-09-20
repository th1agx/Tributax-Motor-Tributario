<div class="hero">
  <h1 style="margin:0">Motor de decisão tributária brasileiro</h1>
  <p>Uma requisição retorna tributos, alíquotas, bases, CFOP/CST, fundamentos legais e o rastro completo da decisão — do MEI que emite NFS-e à multinacional que integra via API.</p>
  <div class="tag-row">
    <span class="tag">ICMS 27/27 UFs</span><span class="tag">DIFAL & FCP</span><span class="tag">ICMS-ST</span>
    <span class="tag">PIS/COFINS</span><span class="tag">IPI + TIPI</span><span class="tag">ISS/NFS-e</span>
    <span class="tag">Simples Anexo I & III</span><span class="tag">CBS/IBS 2026</span>
  </div>
</div>

## O que o Tributax faz

Você envia os dados de uma **operação comercial** — quem emite, quem recebe, o que é vendido, para onde — e recebe a **carga tributária completa**, com explicação para cada centavo:

| Você pergunta | A resposta traz |
|---|---|
| Quais tributos incidem? | ICMS, DIFAL, FCP, PIS, COFINS, IPI, ISS, IRRF/CSLL, DAS, CBS/IBS… |
| Quanto, sobre qual base? | Valor, base de cálculo e alíquota de cada tributo |
| Com qual código? | CFOP inferido e CST/CSOSN por tributo |
| Por quê? | Fundamento legal, regras aplicadas e descartadas, inferências |

## Por que é diferente

1. **Explicável** — toda decisão carrega trace auditável e `rulesetHash` (reprodutibilidade: a mesma resposta hoje e amanhã).
2. **Honesto** — `NO_RULE_FOUND` nunca vira imposto zero; incerteza normativa é marcada como `NEEDS_REVIEW`, nunca suposição silenciosa.
3. **Regras como dados** — vigências disjuntas garantidas por constraint no Postgres; sem `if` tributário espalhado por código.
4. **IA que propõe, humano que aprova** — agente LLM+RAG monitora DOU/RSS e cria apenas rascunhos `AI_SUGGESTED`.
5. **Feito para agentes** — documentação llms.txt, servidor MCP, SDK com retry e idempotência.

<div class="cards">
  <div class="card"><h3>⚡ <a href="#/simulador">Teste no simulador</a></h3><p>Calcule tributos de uma operação real direto no navegador.</p></div>
  <div class="card"><h3>📦 <a href="#/payloads">Payloads prontos</a></h3><p>Um JSON por cenário, com download e cópia em um clique.</p></div>
  <div class="card"><h3>🚀 <a href="#/comeco-rapido">Início rápido</a></h3><p>Primeira requisição em menos de 5 minutos.</p></div>
  <div class="card"><h3>🤖 <a href="#/para-llms">Para LLMs</a></h3><p>Documentação no padrão llms.txt + servidor MCP.</p></div>
</div>

## Exemplo real

Venda interestadual de um notebook de R$ 3.500 (RJ → SP, consumidor final):

| Tributo | Alíquota | Valor | Código | Fundamento |
|---|---|---|---|---|
| ICMS | 12% | R$ 420,00 | CST 00 | Res. Senado 22/1989 |
| DIFAL | 6% | R$ 210,00 | — | LC 190/2022 |
| FCP | 2% | R$ 70,00 | — | LC 87/96, art. 82-A |
| PIS / COFINS | 1,65% / 7,6% | R$ 57,75 / R$ 266,00 | CST 01 | Leis 10.637/02 e 10.833/03 |
| CBS / IBS | 0,90% / 0,10% | R$ 31,50 / R$ 3,50 | — | LC 214/2025 (teste 2026) |

…mais CFOP **6102** inferido, documento **NFC-e** e inferências explicando cada campo ausente. [Entenda cada campo da resposta →](#/resposta)
