/**
 * Money is always an integer number of cents. Floats never hold prices, so
 * totals add up exactly and only formatting ever sees a decimal point.
 */
export type Cents = number;

export const CURRENCY = 'USD';
export const LOCALE = 'en-US';

const formatters = new Map<string, Intl.NumberFormat>();

function formatter(fractionDigits: 0 | 2): Intl.NumberFormat {
  const key = `${LOCALE}:${CURRENCY}:${fractionDigits}`;
  let cached = formatters.get(key);
  if (!cached) {
    cached = new Intl.NumberFormat(LOCALE, {
      style: 'currency',
      currency: CURRENCY,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
    formatters.set(key, cached);
  }
  return cached;
}

export interface FormatMoneyOptions {
  /** Drop ".00" from whole amounts: $48 rather than $48.00. */
  compact?: boolean;
}

export function formatMoney(cents: Cents, { compact = false }: FormatMoneyOptions = {}): string {
  assertCents(cents);
  const whole = cents % 100 === 0;
  return formatter(compact && whole ? 0 : 2).format(cents / 100);
}

/** Reads a typed amount such as "12", "12.5", "$1,299.00" into cents. Returns null if it is not a price. */
export function parseMoney(input: string): Cents | null {
  const trimmed = input.trim().replace(/^\$/, '');
  // Plain digits, or digits grouped in threes with commas ("1,299").
  if (!/^(\d+|\d{1,3}(,\d{3})+)(\.\d{1,2})?$/.test(trimmed)) return null;
  const cleaned = trimmed.replace(/,/g, '');
  const [dollars = '0', fraction = ''] = cleaned.split('.');
  return Number(dollars) * 100 + Number(fraction.padEnd(2, '0'));
}

export function sumCents(amounts: Cents[]): Cents {
  return amounts.reduce((total, amount) => total + amount, 0);
}

export function multiplyCents(cents: Cents, quantity: number): Cents {
  if (!Number.isInteger(quantity) || quantity < 0) throw new RangeError(`Invalid quantity: ${quantity}`);
  return cents * quantity;
}

/** A percentage of an amount, rounded half up to the nearest cent. */
export function percentOf(cents: Cents, percent: number): Cents {
  return Math.round((cents * percent) / 100);
}

/** Whole-number percentage saved going from compareAt to price, rounded down so we never overstate a discount. */
export function discountPercent(price: Cents, compareAt: Cents | undefined): number {
  if (!compareAt || compareAt <= price) return 0;
  return Math.floor(((compareAt - price) / compareAt) * 100);
}

function assertCents(cents: Cents) {
  if (!Number.isInteger(cents)) throw new TypeError(`Money must be whole cents, got ${cents}`);
}
