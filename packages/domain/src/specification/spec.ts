import type { FiscalContext } from "../decision/fiscal-context.js";

/**
 * Specification Pattern (ADR-004): condições fiscais como árvore
 * serializável em JSON, interpretada contra o FiscalContext.
 * A representação serializada é a fonte de verdade das condições
 * das regras; os objetos são a forma compilada.
 */
export type PredicateSpec = {
  readonly kind: "predicate";
  readonly predicate: string;
  readonly args?: Readonly<Record<string, unknown>>;
};

export type AndSpec = { readonly kind: "and"; readonly children: readonly SpecJson[] };
export type OrSpec = { readonly kind: "or"; readonly children: readonly SpecJson[] };
export type NotSpec = { readonly kind: "not"; readonly child: SpecJson };

export type SpecJson = PredicateSpec | AndSpec | OrSpec | NotSpec;

export interface Spec {
  /** Avalia contra o contexto. Nunca lança para dados fora de domínio conhecido. */
  evaluate(ctx: FiscalContext): boolean;
  /** Profundidade = nº de predicados folha (critério de especificidade, ADR-005). */
  depth(): number;
  /** Forma serializada canônica (para hash e persistência). */
  toJson(): SpecJson;
}

export class Predicate implements Spec {
  constructor(
    readonly predicate: string,
    private readonly fn: (ctx: FiscalContext, args: Readonly<Record<string, unknown>>) => boolean,
    private readonly args: Readonly<Record<string, unknown>> = {},
  ) {}

  evaluate(ctx: FiscalContext): boolean {
    return this.fn(ctx, this.args);
  }

  depth(): number {
    return 1;
  }

  toJson(): SpecJson {
    return { kind: "predicate", predicate: this.predicate, ...(this.args && Object.keys(this.args).length ? { args: this.args } : {}) };
  }
}

export class AndSpecNode implements Spec {
  constructor(private readonly children: readonly Spec[]) {}

  evaluate(ctx: FiscalContext): boolean {
    return this.children.every((c) => c.evaluate(ctx));
  }

  depth(): number {
    return this.children.reduce((acc, c) => acc + c.depth(), 0);
  }

  toJson(): SpecJson {
    return { kind: "and", children: this.children.map((c) => c.toJson()) };
  }
}

export class OrSpecNode implements Spec {
  constructor(private readonly children: readonly Spec[]) {}

  evaluate(ctx: FiscalContext): boolean {
    return this.children.some((c) => c.evaluate(ctx));
  }

  depth(): number {
    return this.children.reduce((acc, c) => acc + c.depth(), 0);
  }

  toJson(): SpecJson {
    return { kind: "or", children: this.children.map((c) => c.toJson()) };
  }
}

export class NotSpecNode implements Spec {
  constructor(private readonly child: Spec) {}

  evaluate(ctx: FiscalContext): boolean {
    return !this.child.evaluate(ctx);
  }

  depth(): number {
    return this.child.depth();
  }

  toJson(): SpecJson {
    return { kind: "not", child: this.child.toJson() };
  }
}

export function and(...children: Spec[]): Spec {
  return new AndSpecNode(children);
}

export function or(...children: Spec[]): Spec {
  return new OrSpecNode(children);
}

export function not(child: Spec): Spec {
  return new NotSpecNode(child);
}
