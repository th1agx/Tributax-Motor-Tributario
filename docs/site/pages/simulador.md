# Simulador

<div id="simulator"></div>

Teste o motor com uma operação real, o simulador chama `POST /v1/tax-simulations` nesta mesma instância.

## O que cada campo faz

| Campo | Efeito no cálculo |
|---|---|
|**API key**| Sua chave de tenant. Fica salva apenas no `localStorage` do seu navegador. |
|**UF destinatário**| Define destino da operação: interna × interestadual, DIFAL/FCP quando aplicável. |
|**NCM**| Classifica o produto: alíquota interna da UF do emitente, TIPI/IPI, ST por MVA. |
|**Código de serviço (LC 116)**| Marca a operação como serviço: ISS/NFS-e no lugar de ICMS. |
|**RBT12**| Receita bruta dos 12 últimos meses, habilita o DAS do Simples (Anexo I/III). |
|**Tipo de operação**| `AUTO` infere pelo payload; forçar `SALE_GOODS`, `SERVICE_PROVISION` ou `EXPORT` muda o CFOP e os tributos. |

## Como interpretar o resultado

- **TAXED** com valor: tributo calculado (base × alíquota, ou efeito específico como ST/DAS).
- **EXEMPT / IMMUNE / NON_TAXABLE / ZERO_RATED**: não incide, com fundamento legal.
- **NO_RULE_FOUND**: o motor não tem regra para o caso, e** nunca **assume imposto zero. A coluna CST/Obs. traz hints do que faltou.
- **Carga total**: soma dos tributos do item. O painel "resposta completa" mostra o JSON integral com fundamentos, regras aplicadas e inferências.

> Dica: compare com o [payload do mesmo cenário](#/payloads) para ver o contrato completo, incluindo o cadastro do emitente (`/v1/parties`) que enriquece o cálculo com regime e UF de origem.
