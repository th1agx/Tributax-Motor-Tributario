import { buildPredicate, VocabularyError } from "./vocabulary.js";
import { and, not, or, type Spec, type SpecJson } from "./spec.js";

/**
 * SpecificationCompiler — transforma SpecJson (dado persistido na regra)
 * em Spec avaliável, validando cada predicado contra o vocabulário v1.
 * Predicado desconhecido/estrutura inválida = erro em CARGA (ADR-004),
 * nunca falha silenciosa em cálculo.
 */
export function compile(json: SpecJson): Spec {
  switch (json.kind) {
    case "predicate":
      return buildPredicate(json.predicate, json.args ?? {});
    case "and": {
      if (!Array.isArray(json.children) || json.children.length === 0) {
        throw new VocabularyError("'and' exige children não-vazio");
      }
      return and(...json.children.map(compile));
    }
    case "or": {
      if (!Array.isArray(json.children) || json.children.length === 0) {
        throw new VocabularyError("'or' exige children não-vazio");
      }
      return or(...json.children.map(compile));
    }
    case "not":
      return not(compile(json.child));
    default:
      throw new VocabularyError(`estrutura de specification inválida: ${JSON.stringify(json)}`);
  }
}
