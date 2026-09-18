/**
 * Money — valor monetário como inteiro em centavos (ADR-006).
 * Proibido ponto flutuante em qualquer aritmética do domínio.
 */
export type RoundingPolicy = "HALF_UP" | "FLOOR";

export class Money {
  private readonly brand = "Money";

  private constructor(readonly cents: number) {
    if (!Number.isInteger(cents)) {
      throw new MoneyError("centavos devem ser inteiro");
    }
    if (Math.abs(cents) > Number.MAX_SAFE_INTEGER) {
      throw new MoneyError("valor excede limite seguro de inteiro");
    }
  }

  static fromCents(cents: number): Money {
    return new Money(cents);
  }

  static zero(): Money {
    return new Money(0);
  }

  add(other: Money): Money {
    return new Money(this.cents + other.cents);
  }

  subtract(other: Money): Money {
    return new Money(this.cents - other.cents);
  }

  isZero(): boolean {
    return this.cents === 0;
  }

  isNegative(): boolean {
    return this.cents < 0;
  }

  equals(other: Money): boolean {
    return this.cents === other.cents;
  }

  /**
   * Aloca o valor proporcionalmente a pesos inteiros positivos,
   * distribuindo o resíduo do arredondamento nos primeiros pesos
   * (default de chargeAllocation, payload-spec §6).
   */
  allocate(weights: number[]): Money[] {
    if (weights.length === 0) return [];
    const total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0 || weights.some((w) => !Number.isInteger(w) || w < 0)) {
      throw new MoneyError("pesos devem ser inteiros não-negativos com total positivo");
    }
    const parts: number[] = [];
    let distributed = 0;
    for (const w of weights) {
      const part = Math.trunc((this.cents * w) / total);
      parts.push(part);
      distributed += part;
    }
    let remainder = this.cents - distributed;
    for (let i = 0; remainder > 0 && i < parts.length; i++, remainder--) {
      parts[i]! += 1;
    }
    return parts.map((p) => new Money(p));
  }
}

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

/** Divisão inteira com política de arredondamento explícita. */
export function integerDiv(numerator: number, denominator: number, policy: RoundingPolicy): number {
  if (denominator === 0) throw new MoneyError("divisão por zero");
  if (policy === "FLOOR") return Math.trunc(numerator / denominator);
  // HALF_UP para inteiros (numerador/denominador positivos ou negativos)
  const q = numerator / denominator;
  const floor = Math.floor(q);
  const frac = q - floor;
  if (frac > 0.5) return floor + 1;
  if (frac < 0.5) return floor;
  return floor + 1; // frac === 0.5 → arredonda para cima em módulo
}
