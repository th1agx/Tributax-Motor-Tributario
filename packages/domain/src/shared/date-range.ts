/**
 * DateRange — vigência temporal (ADR-003/ADR-005).
 * `to` indefinido = vigência aberta.
 */
export class DateRange {
  private readonly brand = "DateRange";

  private constructor(
    readonly from: Date,
    readonly to?: Date,
  ) {
    if (to && to.getTime() <= from.getTime()) {
      throw new DateRangeError("fim da vigência deve ser posterior ao início");
    }
  }

  static from(from: Date, to?: Date): DateRange {
    return new DateRange(from, to);
  }

  contains(date: Date): boolean {
    if (date.getTime() < this.from.getTime()) return false;
    if (this.to && date.getTime() >= this.to.getTime()) return false;
    return true;
  }

  isOpenEnded(): boolean {
    return this.to === undefined;
  }

  overlaps(other: DateRange): boolean {
    const thisEnd = this.to ?? new Date(8640000000000000);
    const otherEnd = other.to ?? new Date(8640000000000000);
    return this.from < otherEnd && other.from < thisEnd;
  }

  equals(other: DateRange): boolean {
    return (
      this.from.getTime() === other.from.getTime() &&
      this.to?.getTime() === other.to?.getTime()
    );
  }
}

export class DateRangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DateRangeError";
  }
}
