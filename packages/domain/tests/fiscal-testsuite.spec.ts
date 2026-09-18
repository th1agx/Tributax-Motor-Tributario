import { describe, expect, it } from "vitest";
import { calculateIcms } from "../src/tribute/icms.js";
import { ICMS_CASES } from "./fiscal-testsuite/icms-cases.js";

describe("Fiscal Test Suite — ICMS (regressão como dado)", () => {
  for (const testCase of ICMS_CASES) {
    it(`${testCase.id}: ${testCase.name} [${testCase.legalBasis}]`, () => {
      const result = calculateIcms(testCase.given);
      const { expect: e } = testCase;

      if (e.icmsOutcomeKind !== undefined) {
        expect(result.icms.outcome.kind).toBe(e.icmsOutcomeKind);
      }
      if (result.icms.outcome.kind === "TAXED") {
        expect(result.icms.outcome.amountCents).toBe(e.icmsAmountCents);
        expect(result.icms.outcome.rateBp).toBe(e.icmsRateBp);
      }

      expect(result.difal !== undefined).toBe(e.hasDifal ?? false);
      if (e.hasDifal && result.difal && result.difal.outcome.kind === "TAXED") {
        expect(result.difal.outcome.amountCents).toBe(e.difalAmountCents);
        expect(result.difal.split.originCents).toBe(e.difalOriginCents);
        expect(result.difal.split.destinationCents).toBe(e.difalDestinationCents);
      }
    });
  }
});
