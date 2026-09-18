import { Money, integerDiv, type RoundingPolicy } from "./money.js";

/**
 * TaxRate — alíquota em basis points inteiros (ADR-006).
 * 1200 = 12%. Frações de basis point são proibidas; legislação
 * fracionária (ex.: 1/3 de FCP) representa-se como Fraction.
 */
export class TaxRate {
  private readonly brand = "TaxRate";

  private constructor(readonly basisPoints: number) {
    if (!Number.isInteger(basisPoints)) {
      throw new TaxRateError("alíquota deve ser basis points inteiro");
    }
    if (basisPoints < 0 || basisPoints > 10000) {
      throw new TaxRateError("alíquota fora dos limites [0, 10000] bp");
    }
  }

  static fromBasisPoints(bp: number): TaxRate {
    return new TaxRate(bp);
  }

  static fromPercent(percent: number): TaxRate {
    return new TaxRate(Math.round(percent * 100));
  }

  isZero(): boolean {
    return this.basisPoints === 0;
  }

  equals(other: TaxRate): boolean {
    return this.basisPoints === other.basisPoints;
  }

  /** basis * rate / 10000 com arredondamento explícito. */
  applyTo(basis: Money, policy: RoundingPolicy = "HALF_UP"): Money {
    return Money.fromCents(
      integerDiv(basis.cents * this.basisPoints, 10000, policy),
    );
  }
}

/** Fração explícita (numerador/denominador) p/ legislação fracionária. */
export class Fraction {
  private readonly brand = "Fraction";

  private constructor(
    readonly numerator: number,
    readonly denominator: number,
  ) {
    if (!Number.isInteger(numerator) || !Number.isInteger(denominator)) {
      throw new TaxRateError("fração deve ter termos inteiros");
    }
    if (denominator === 0) throw new TaxRateError("denominador zero");
  }

  static of(numerator: number, denominator: number): Fraction {
    return new Fraction(numerator, denominator);
  }

  applyTo(money: Money, policy: RoundingPolicy = "HALF_UP"): Money {
    return Money.fromCents(
      integerDiv(money.cents * this.numerator, this.denominator, policy),
    );
  }
}

export class TaxRateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaxRateError";
  }
}
