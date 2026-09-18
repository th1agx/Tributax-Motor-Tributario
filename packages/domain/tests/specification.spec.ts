import { describe, expect, it } from "vitest";
import { and, not, or } from "../src/specification/spec.js";
import { compile } from "../src/specification/compiler.js";
import { VOCABULARY_VERSION } from "../src/specification/vocabulary.js";
import type { FiscalContext } from "../src/decision/fiscal-context.js";
import { makeCtx } from "./helpers.js";

describe("specifications", () => {
  const interstate: FiscalContext = makeCtx({
    issuerState: "MG",
    recipientState: "SP",
    recipientRole: "FINAL_CONSUMER",
  });

  it("predicados compostos avaliam AND/OR/NOT", () => {
    const spec = and(
      compile({ kind: "predicate", predicate: "isInterstate" }),
      not(compile({ kind: "predicate", predicate: "isFinalConsumer" })),
    );
    expect(spec.evaluate(interstate)).toBe(false);
    expect(spec.depth()).toBe(2);
    expect(or(
      compile({ kind: "predicate", predicate: "isFinalConsumer" }),
      not(compile({ kind: "predicate", predicate: "isInterstate" })),
    ).evaluate(interstate)).toBe(true);
  });

  it("predicado desconhecido é rejeitado em carga, não em cálculo", () => {
    expect(() => compile({ kind: "predicate", predicate: "taxaMagica" })).toThrow(
      /predicado desconhecido.*spec-v1/,
    );
  });

  it("estrutura inválida é rejeitada", () => {
    expect(() => compile({ kind: "and", children: [] } as never)).toThrow();
  });

  it("round-trip toJson preserva a estrutura", () => {
    const json = {
      kind: "or",
      children: [
        { kind: "predicate", predicate: "recipientStateIs", args: { uf: "SP" } },
        { kind: "predicate", predicate: "regimeIs", args: { regime: "MEI" } },
      ],
    } as const;
    expect(compile(json).toJson()).toEqual(json);
  });

  it("vocabulário reporta versão estável", () => {
    expect(VOCABULARY_VERSION).toBe("spec-v1");
  });
});
