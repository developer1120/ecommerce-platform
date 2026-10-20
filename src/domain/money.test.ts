import { discountPercent, formatMoney, multiplyCents, parseMoney, percentOf, sumCents } from './money';

describe('formatMoney', () => {
  it('formats cents as US dollars with two decimals', () => {
    expect(formatMoney(3840)).toBe('$38.40');
    expect(formatMoney(5)).toBe('$0.05');
    expect(formatMoney(0)).toBe('$0.00');
    expect(formatMoney(129900)).toBe('$1,299.00');
  });

  it('drops the cents from whole amounts when compact', () => {
    expect(formatMoney(4800, { compact: true })).toBe('$48');
    expect(formatMoney(4850, { compact: true })).toBe('$48.50');
  });

  it('formats negative amounts, such as discounts', () => {
    expect(formatMoney(-1000)).toBe('-$10.00');
  });

  it('refuses fractional cents', () => {
    expect(() => formatMoney(10.5)).toThrow(/whole cents/);
  });
});

describe('parseMoney', () => {
  it.each([
    ['12', 1200],
    ['12.5', 1250],
    ['12.05', 1205],
    ['0.99', 99],
    ['$1,299.00', 129900],
    ['  48 ', 4800],
  ])('reads %j as %i cents', (input, cents) => {
    expect(parseMoney(input)).toBe(cents);
  });

  it.each(['', 'abc', '12.345', '-5', '1.2.3', '12,', '1,29', ',100'])('rejects %j', (input) => {
    expect(parseMoney(input)).toBeNull();
  });
});

describe('arithmetic', () => {
  it('sums amounts exactly', () => {
    // 0.1 + 0.2 style float drift cannot happen in cents.
    expect(sumCents([10, 20, 30])).toBe(60);
    expect(sumCents([])).toBe(0);
  });

  it('multiplies by whole quantities only', () => {
    expect(multiplyCents(1999, 3)).toBe(5997);
    expect(multiplyCents(1999, 0)).toBe(0);
    expect(() => multiplyCents(1999, 1.5)).toThrow(RangeError);
    expect(() => multiplyCents(1999, -1)).toThrow(RangeError);
  });

  it('takes a percentage and rounds to the nearest cent', () => {
    expect(percentOf(4800, 20)).toBe(960);
    expect(percentOf(1999, 15)).toBe(300); // 299.85 rounds up
    expect(percentOf(1001, 10)).toBe(100); // 100.1 rounds down
  });
});

describe('discountPercent', () => {
  it('reports the saving as a whole percentage, rounded down', () => {
    expect(discountPercent(3840, 4800)).toBe(20);
    expect(discountPercent(2000, 3000)).toBe(33); // 33.3…
    expect(discountPercent(1960, 2800)).toBe(30);
  });

  it('is zero without a higher compare-at price', () => {
    expect(discountPercent(4800, undefined)).toBe(0);
    expect(discountPercent(4800, 4800)).toBe(0);
    expect(discountPercent(4800, 4000)).toBe(0);
  });
});
