# Curadoria de ISS municipal — fluxo canônico

A alíquota do ISS **varia por serviço** dentro da banda 2%–5% (LC 116/2003,
art. 8º-A) e é definida em lei **municipal**. O Tributax não inventa taxa única
por município: o catálogo em código traz apenas municípios conferidos com base
legal citada, e a escala vem pela **importação da planilha nacional oficial**.

## Fonte oficial

**Portal Nacional da NFS-e — "Alíquotas de ISSQN"** (gov.br, publicação de
03/09/2026): uma planilha **CSV por estado** + TXT consolidado com as alíquotas
cadastradas por município **e por código de serviço**. Download direto:

```
https://www.gov.br/nfse/pt-br/biblioteca/aliquotas/aliquotas-municipios-20260903-extr1.zip
```

(página: <https://www.gov.br/nfse/pt-br/biblioteca/aliquotas/aliquotas-de-issqn>;
o sufixo do ZIP carrega a data da publicação — conferir a página para versões novas)

Formato oficial (separador `;`):

```
codigo_ibge;uf;nome_municipio;codigo_servico;incidencia;aliquota;dt_ini;dt_fim
3106200;MG;Belo Horizonte;01.01.01.000;01.01.01.000;5;2026-01-01T00:00:00;
```

## Importar (planilha nacional — caminho recomendado)

O importador nacional agrupa por (município × alíquota) e casa o item por
código de serviço (`serviceCodeIn`); linhas fora da banda 2–5% são descartadas
na carga. Números da versão 03/09/2026: **1.900.385 linhas → 5.340 municípios
→ 11.692 regras**.

```bash
# 1. baixe e extraia o ZIP oficial (URL acima)
curl -LO https://www.gov.br/nfse/pt-br/biblioteca/aliquotas/aliquotas-municipios-20260903-extr1.zip
unzip aliquotas-municipios-20260903-extr1.zip

cd packages/infrastructure

# 2. conferência sem tocar no banco (estatísticas):
npx tsx src/iss-import-nacional.cli.ts --txt ../aliquotas-municipios-20260903.txt --dry-run

# 3. importação real (lotes de 400; idempotente por id+versão):
DATABASE_URL="postgres://..." npx tsx src/iss-import-nacional.cli.ts --txt ../aliquotas-municipios-20260903.txt
```

## Formato antigo (tabela curada, uma taxa por município)

CSV `ibge;uf;nome;aliquota` via `iss-import.cli.ts` — mantido para curadoria
manual; prefira o importador nacional acima.

O importador:
- valida a banda 2–5% (LC 116 art. 8º-A) e deduplica por IBGE;
- gera regras `ISS-{ibge}-{bp}` com jurisdição MUNICIPAL, vigência e
  `reviewReason` apontando a fonte (triagem humana antes de confiar);
- exige `issuerMunicipality` (IBGE 7 dígitos) no payload para casar — sem ele,
  o motor responde `NO_RULE_FOUND` honesto.

## Varredura de mudanças (agente)

O workflow semanal `legislation-watch.yml` varre diários municipais via
[Querido Diário](https://queridodiario.ok.org.br) para os municípios da matriz
(SP, RJ, BH + nacional). Ao incluir um município novo no catálogo, adicione-o
à matriz com `territory_id` (IBGE 7 dígitos) para monitorar mudanças da lei
local automaticamente.
