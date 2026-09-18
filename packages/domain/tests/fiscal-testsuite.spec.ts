import { describe, expect, it } from "vitest";
import { calculateIcms } from "../src/tribute/icms.js";
import { calculatePisCofins } from "../src/tribute/pis-cofins.js";
import { calculateIssRetentions } from "../src/tribute/iss-retencoes.js";
import { ICMS_CASES } from "./fiscal-testsuite/icms-cases.js";

describe("Fiscal Test Suite — ICMS (regressão como dado)", () => {
  for (const testCase of ICMS_CASES) {
    it(`${testCase.id}: ${testCase.name} [${testCase.legalBasis}]`, () => {
      const { expect: e } = testCase;

      // PIS/COFINS (casos PISCOFINS-*) — decididos pelo módulo federal
      if (e.pisOutcomeKind !== undefined || e.pisAmountCents !== undefined) {
        const federal = calculatePisCofins(testCase.given);
        if (e.pisOutcomeKind !== undefined) {
          expect(federal.pis.outcome.kind).toBe(e.pisOutcomeKind);
          expect(federal.cofins.outcome.kind).toBe(e.cofinsOutcomeKind ?? e.pisOutcomeKind);
        } else {
          expect(federal.pis.outcome).toMatchObject({ amountCents: e.pisAmountCents });
          expect(federal.cofins.outcome).toMatchObject({ amountCents: e.cofinsAmountCents });
        }
        return;
      }

      // Retenções (casos RETENCAO-*) — decididos pelo módulo de retenções
      if (e.irrfOutcomeKind !== undefined || e.irrfAmountCents !== undefined) {
        const retentions = calculateIssRetentions(testCase.given);
        if (e.irrfOutcomeKind !== undefined) {
          expect(retentions.irrf.outcome.kind).toBe(e.irrfOutcomeKind);
          expect(retentions.csrf.outcome.kind).toBe(e.csrfOutcomeKind ?? e.irrfOutcomeKind);
        } else {
          expect(retentions.irrf.outcome).toMatchObject({ amountCents: e.irrfAmountCents });
          expect(retentions.csrf.outcome).toMatchObject({ amountCents: e.csrfAmountCents });
        }
        return;
      }

      const result = calculateIcms(testCase.given);

      if (e.icmsOutcomeKind !== undefined) {
        expect(result.icms.outcome.kind).toBe(e.icmsOutcomeKind);
      }
      if (result.icms.outcome.kind === "TAXED") {
        expect(result.icms.outcome.amountCents).toBe(e.icmsAmountCents);
        if (e.icmsRateBp !== undefined) {
          expect(result.icms.outcome.rateBp).toBe(e.icmsRateBp);
        }
      }

      expect(result.difal !== undefined).toBe(e.hasDifal ?? false);
      if (e.hasDifal && result.difal && result.difal.outcome.kind === "TAXED") {
        expect(result.difal.outcome.amountCents).toBe(e.difalAmountCents);
        expect(result.difal.split.originCents).toBe(e.difalOriginCents);
        expect(result.difal.split.destinationCents).toBe(e.difalDestinationCents);
      }

      if (e.fcpAmountCents !== undefined) {
        expect(result.fcp).toBeDefined();
        expect(result.fcp?.outcome).toMatchObject({ amountCents: e.fcpAmountCents });
      } else if (e.hasDifal === false) {
        expect(result.fcp).toBeUndefined();
      }
    });
  }
});
