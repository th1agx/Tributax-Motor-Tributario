import type { FiscalContext, RecipientRole, OperationKind, FiscalDocumentType, TaxRegime, MerchandiseOrigin, OperationPurpose } from "../decision/fiscal-context.js";
import { isInterstate } from "../decision/fiscal-context.js";
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
  issuerStateIs: (ctx, a) => ctx.issuerState === expectString(a, "uf"),
  recipientStateIs: (ctx, a) => ctx.recipientState === expectString(a, "uf"),
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
