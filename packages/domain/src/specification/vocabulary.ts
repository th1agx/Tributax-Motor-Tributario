import type { FiscalContext, RecipientRole, OperationKind, FiscalDocumentType, TaxRegime, MerchandiseOrigin, OperationPurpose, Uf } from "../decision/fiscal-context.js";
import { isInterstate } from "../decision/fiscal-context.js";
import { REGION_OF, type Region } from "../tribute/regions.js";
import { Predicate } from "./spec.js";

/**
 * Vocabulário v1 de predicados fiscais (ADR-011).
 * Evolução só aditiva nesta major; mudança de semântica = spec-v2.
 */
export const VOCABULARY_VERSION = "spec-v1";

export type PredicateEvaluator = (ctx: FiscalContext, args: Readonly<Record<string, unknown>>) => boolean;

function expectString(args: Readonly<Record<string, unknown>>, key: string): string {
  const v = args[key];
  if (typeof v !== "string") throw new VocabularyError(`argumento '${key}' deve ser string`);
  return v;
}

function expectStringArray(args: Readonly<Record<string, unknown>>, key: string): readonly string[] {
  const v = args[key];
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) {
    throw new VocabularyError(`argumento '${key}' deve ser array de strings`);
  }
  return v as readonly string[];
}

const registry: Record<string, PredicateEvaluator> = {
  isInterstate: (ctx) => isInterstate(ctx),
  isInternal: (ctx) => !isInterstate(ctx),
  isFinalConsumer: (ctx) => ctx.recipientRole === "FINAL_CONSUMER",
  recipientRoleIs: (ctx, a) => ctx.recipientRole === (expectString(a, "role") as RecipientRole),
  operationKindIs: (ctx, a) => ctx.operationKind === (expectString(a, "kind") as OperationKind),
  purposeIs: (ctx, a) => ctx.purpose === (expectString(a, "purpose") as OperationPurpose),
  fiscalDocumentTypeIs: (ctx, a) => ctx.fiscalDocumentType === (expectString(a, "type") as FiscalDocumentType),
  regimeIs: (ctx, a) => ctx.regime === (expectString(a, "regime") as TaxRegime),
  issuerStateIs: (ctx, a) => ctx.issuerState === (expectString(a, "uf") as Uf),
  recipientStateIs: (ctx, a) => ctx.recipientState === (expectString(a, "uf") as Uf),
  issuerRegionIs: (ctx, a) => REGION_OF[ctx.issuerState] === (expectString(a, "region") as Region),
  recipientRegionIs: (ctx, a) => REGION_OF[ctx.recipientState] === (expectString(a, "region") as Region),
  /** NCM de qualquer item começa com o prefixo (capítulo). */
  ncmStartsWith: (ctx, a) => {
    const prefix = expectString(a, "prefix");
    return ctx.items.some((i) => i.ncm?.startsWith(prefix) ?? false);
  },
  /** NCM de qualquer item está na lista (8 dígitos exatos). */
  ncmIn: (ctx, a) => {
    const list = expectStringArray(a, "list");
    return ctx.items.some((i) => i.ncm !== undefined && list.includes(i.ncm));
  },
  hasServiceCode: (ctx) => ctx.items.some((i) => i.serviceCode !== undefined),
  serviceCodeIs: (ctx, a) => {
    const code = expectString(a, "code");
    return ctx.items.some((i) => i.serviceCode === code);
  },
  itemOriginIs: (ctx, a) => {
    const origin = expectString(a, "origin") as MerchandiseOrigin;
    return ctx.items.some((i) => i.origin === origin);
  },
  hasNcm: (ctx) => ctx.items.some((i) => i.ncm !== undefined),
  issuerMunicipalityIs: (ctx, a) => ctx.issuerMunicipality === expectString(a, "ibgeCode"),
  hasIssuerMunicipality: (ctx) => ctx.issuerMunicipality !== undefined,
  /** RBT12 >= limite (centavos); sem RBT12 informado, false — faixa alguma casa (honesto). */
  rbt12AtLeast: (ctx, a) => (ctx.rbt12Cents ?? -1) >= (a.cents as number),
  /** RBT12 < limite (centavos). */
  rbt12Below: (ctx, a) => (ctx.rbt12Cents ?? Number.MAX_SAFE_INTEGER) < (a.cents as number),
};

export type PredicateName = keyof typeof registry;

export function hasPredicate(name: string): name is PredicateName {
  return Object.prototype.hasOwnProperty.call(registry, name);
}

export function buildPredicate(name: string, args: Readonly<Record<string, unknown>>): Predicate {
  if (!hasPredicate(name)) {
    throw new VocabularyError(`predicado desconhecido no vocabulário ${VOCABULARY_VERSION}: '${name}'`);
  }
  return new Predicate(name, registry[name]!, args);
}

export class VocabularyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VocabularyError";
  }
}
