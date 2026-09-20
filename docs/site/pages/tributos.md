# Tributos & cobertura

O que o motor calcula hoje, com fundamento legal por resposta.

## Visão geral

| Área | Cobertura | Notas |
|---|---|---|
| **ICMS — alíquota interna** | 27/27 UFs | Fontes públicas 2026; AL 20,5% com vigência a partir de 04/2026 |
| **ICMS — interestadual** | 7% / 12% / 4% | Res. Senado 22/1989 por origem/destino |
| **DIFAL** | Todas as UFs | Partilha 20/80 (LC 190/2022) |
| **FCP** | 21 UFs + DF 2% | MG/SC sem FCP; por NCM (AL/GO/MT/AM) no roadmap |
| **ICMS-ST** | MVA por UF × NCM | Conv. 92/15; CST 10/CSOSN 500; vICMSST líquido (bruto − próprio) |
| **PIS/COFINS** | Cumulativo e não cumulativo | 1,65%/7,6% (não cumulativo), 0,65%/3% (cumulativo), isenção e suspensão |
| **IPI** | Por NCM (TIPI oficial) | Importador da tabela RFB; imunidade de exportação (CF 153 §3º III); serviços não incidem |
| **ISS / NFS-e** | LC 116/03 | Município do prestador (IBGE), deduções de base, exportação não incide, retenção PJ→PJ sinalizada |
| **Simples — Anexo I** | 6 faixas RBT12 + 7ª | Pós-unificação; 7ª faixa (22,5%) marcada `NEEDS_REVIEW` |
| **Simples — Anexo III** | Alíquota efetiva | Nominal − dedução×10000/RBT12; condição de serviço mais específica vence o Anexo I |
| **DAS-MEI** | Fora do motor | Valor fixo mensal por legislação própria — não há o que decidir |
| **CBS / IBS** | Alíquotas-teste 2026 | LC 214/2025 com vigência explícita `[2026-01-01, 2027-01-01)` e split payment sinalizado como warning |
| **Retenções federais** | IRRF 1,5% / CSLL 4,65%… | Serviços PJ→PJ |

## Incerteza marcada, nunca escondida

Onde fontes públicas divergem (AC, AL, MA, PE, RO em pontos específicos), a regra nasce com `NEEDS_REVIEW` e um `reviewReason` citando as fontes em conflito. Você vê a marca na resposta — o contrário de um número bonito e errado.

## Atualização legislativa

Um agente LLM+RAG varre fontes públicas (DOU, RSS oficiais) semanalmente:

```
fontes → chunking → embeddings (pgvector) → recuperação → extração com guardrails
→ proposta DRAFT (AI_SUGGESTED) → fila humana → aprovação → ACTIVE
```

Guardrails anti-alucinação: a alíquota citada precisa estar escrita no texto da norma; a fonte é amarrada ao chunk lido; toda rejeição tem motivo. **IA propõe, humano aprova** — invariante garantida no código ([ADR-012](/docs/adr/ADR-012-monitoracao-legislativa-por-ia.md)).
