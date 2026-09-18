# ADR-006 — Representação monetária: inteiros

- Status: ACEITO
- Data: 2026-09-18

## Contexto

Float em cálculo tributário é defeito legal, não cosmético. O contrato de API
já fixa centavos inteiros no fio.

## Decisão

- **Money**: VO imutável com inteiro em centavos (`amount: number` inteiro
  seguro até 2^53; validação de limites no construtor).
- **Percentuais**: basis points inteiros (1200 = 12%); frações de basis point
  são proibidas — se a legislação exigir (ex.: 1/3 de FCP), representa-se como
  fração explícita (numerador/denominador) resolvida pelo motor.
- **Proibido** no domínio: aritmética de ponto flutuante em qualquer valor
  monetário ou base de cálculo; `toFixed`/rounding de float.
- Arredondamento: política explícita e configurável por decisão (default
  HALF_UP, centavos), registrada no trace.

## Alternativas

1. **decimal.js/big.js** — aceitável como fallback; inteiros são mais simples,
   auditáveis e já são o contrato do fio.
2. **float** — rejeitado sem discussão.

## Consequências

- (+) Determinismo numérico total entre plataformas.
- (+) Igualdade estrutural de VOs simplifica testes.
- (-) Multiplicação valor×alíquota exige cuidado com escala intermediária:
  helper centralizado do domínio com teste dedicado.
