# Curadoria de ISS municipal — fluxo canônico

A alíquota do ISS **varia por serviço** dentro da banda 2%–5% (LC 116/2003,
art. 8º-A) e é definida em lei **municipal**. O Tributax não inventa taxa única
por município: o catálogo em código traz apenas municípios conferidos com base
legal citada, e a escala vem pela **importação da planilha nacional oficial**.

## Fonte oficial

**Portal Nacional da NFS-e — "Alíquotas de ISSQN"** (gov.br, publicação de
03/09/2026): uma planilha **CSV por estado** + TXT consolidado com as alíquotas
cadastradas dos 5.571 municípios. Acesse pelo Portal da NFS-e em
<https://www.gov.br/nfse> (página "Alíquotas de ISSQN"; o link direto de
download exige navegação no portal — não há URL estável para automação hoje).

Notas da fonte: ~60% das linhas estão no teto de 5%; nenhuma viola o piso de
2%; a versão de 09/2026 **ainda não cobre SP, Rio e DF** (nesses, usar a lei
municipal direta — o catálogo em código já traz SP/RJ/BH com base legal).

## Formato aceito pelo importador

CSV com colunas `ibge;uf;nome;aliquota` (separador `;` ou `,`; cabeçalho
opcional; alíquota em % com vírgula decimal):

```csv
ibge;uf;nome;aliquota
3106200;MG;Belo Horizonte;3,0
3548500;SP;Santos;2,5
```

Linhas fora da banda 2–5% da LC 116 são **descartadas** na carga (nunca
entram silenciosamente).

## Importar

```bash
# 1. baixe os CSVs da planilha nacional no Portal da NFS-e (gov.br/nfse)
# 2. consolide no formato acima (um arquivo por estado também serve) e rode:

cd packages/infrastructure

# conferência sem tocar no banco (recomendado primeiro):
npx tsx src/iss-import.cli.ts --csv iss-municipios.csv --dry-run

# importação real (idempotente por IBGE; primeira ocorrência vence):
DATABASE_URL="postgres://..." npx tsx src/iss-import.cli.ts --csv iss-municipios.csv
```

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
