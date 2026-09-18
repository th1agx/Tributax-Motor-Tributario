import type { Uf } from "../decision/fiscal-context.js";

export type Region = "NORTH" | "NORTHEAST" | "CENTER_WEST" | "SOUTHEAST" | "SOUTH";

/**
 * Macrorregiões geográficas (IBGE). ATENÇÃO: os benefícios de alíquota
 * interestadual (Resolução SF 22/89) usam agrupamento PRÓPRIO que inclui
 * o ES com N/NE/CO como origem favorecida — ver `ICMS_INTERSTATE_REGION`.
 */
export const REGION_OF: Readonly<Record<Uf, Region>> = {
  AC: "NORTH", AP: "NORTH", AM: "NORTH", PA: "NORTH", RO: "NORTH", RR: "NORTH", TO: "NORTH",
  AL: "NORTHEAST", BA: "NORTHEAST", CE: "NORTHEAST", MA: "NORTHEAST", PB: "NORTHEAST",
  PE: "NORTHEAST", PI: "NORTHEAST", RN: "NORTHEAST", SE: "NORTHEAST",
  DF: "CENTER_WEST", GO: "CENTER_WEST", MT: "CENTER_WEST", MS: "CENTER_WEST",
  ES: "SOUTHEAST", MG: "SOUTHEAST", RJ: "SOUTHEAST", SP: "SOUTHEAST",
  PR: "SOUTH", RS: "SOUTH", SC: "SOUTH",
};
