<p class="byline">Documentação · <b>Tributax</b> · Motor de decisão tributária</p>

# Quanto de imposto há nesta venda?

<p class="statement">Uma requisição, e você sabe <mark>quais tributos incidem</mark>, quanto, sobre qual base, com qual fundamento legal e por quê.</p>

<p class="lede">O Tributax recebe os dados de uma operação comercial: quem emite, quem recebe, o que é vendido, para onde. E devolve a carga tributária completa, com CFOP, CST/CSOSN, vigências e o rastro de cada decisão. Do MEI que emite uma NFS-e à multinacional que integra via API.</p>

<div class="toc">
  <a href="#/simulador"><span class="n">01</span><span class="t">Simulador</span><span class="d"> teste o motor no navegador, agora</span></a>
  <a href="#/comeco-rapido"><span class="n">02</span><span class="t">Início rápido</span><span class="d"> primeira requisição em cinco minutos</span></a>
  <a href="#/payloads"><span class="n">03</span><span class="t">Payloads por cenário</span><span class="d"> oito casos brasileiros, prontos para baixar</span></a>
  <a href="#/tributos"><span class="n">04</span><span class="t">Tributos e cobertura</span><span class="d"> o que o motor calcula hoje</span></a>
  <a href="#/para-llms"><span class="n">05</span><span class="t">Para agentes de IA</span><span class="d"> llms.txt, MCP e o contrato aberto</span></a>
</div>

## Um exemplo, do pedido ao centavo

Venda interestadual de um notebook de R$ 3.500, destinatário consumidor final em São Paulo. Eis a resposta que a API devolve, já com os códigos que o documento fiscal pede:

| Tributo | Alíquota | Valor | Código | Fundamento |
|---|---|---|---|---|
| ICMS | 12% | R$ 420,00 | CST 00 | Res. Senado 22/1989 |
| DIFAL | 6% | R$ 210,00 |  | LC 190/2022 |
| FCP | 2% | R$ 70,00 |  | LC 87/96, art. 82-A |
| PIS e COFINS | 1,65% e 7,6% | R$ 323,75 | CST 01 | Leis 10.637/02 e 10.833/03 |
| CBS e IBS | 0,90% e 0,10% | R$ 35,00 |  | LC 214/2025, teste 2026 |

Além da tabela: CFOP 6102 inferido, documento NFC-e, e uma lista de inferências explicando cada campo que o payload não trouxe. Reproduzível: a resposta carrega o `rulesetHash` do snapshot de regras usado.

## O que sustenta o resultado

 **Explicabilidade.** Toda decisão traz fundamento legal, regras aplicadas e descartadas, e o porquê de cada inferência. Com `detailLevel: FULL_TRACE`, o rastro completo de resolução.

 **Honestidade fiscal.** Quando não há regra, a resposta diz `NO_RULE_FOUND` e nunca assume imposto zero. Onde fontes públicas divergem, a regra nasce marcada `NEEDS_REVIEW`, com as fontes citadas. Incerteza marcada é melhor que número bonito e errado.

 **Regras como dados.** O catálogo vive no Postgres, com vigências disjuntas garantidas por constraint. Nenhum `if` tributário espalhado por código; uma correção de regra é uma nova versão com vigência futura, e o histórico jamais é reescrito.

 **IA que propõe, humano que aprova.** Um agente com RAG monitora DOU e RSS oficiais, extrai observações com fonte primária e cria apenas rascunhos `AI_SUGGESTED`. A aprovação é sempre humana, e isso é invariante de código, não de política.

## Cobertura atual

ICMS nas 27 UFs com alíquota interna e fontes públicas de 2026; interestadual, DIFAL e FCP; substituição tributária com MVA por UF; PIS/COFINS nos dois regimes; IPI sobre a TIPI oficial; ISS pela LC 116/03 com município do prestador; DAS do Simples nos Anexos I e III; retenções federais em serviços; e as alíquotas-teste de CBS/IBS da LC 214/2025, com vigência explícita. Os detalhes, incluindo o que ainda está marcado para revisão, estão na página [Tributos e cobertura](#/tributos).

## Para quem é

Para o ERP que precisa calcular tributos na emissão; para o marketplace que antecipa o custo fiscal do carrinho; para o contador que quer fundamentar cada centavo; e para o agente de IA, que encontra aqui documentação de máquina (llms.txt), servidor MCP e um contrato OpenAPI estável. [Comece pelo simulador](#/simulador) ou siga para o [início rápido](#/comeco-rapido).
