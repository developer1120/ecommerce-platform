import { PRODUCT_FITS, SIZE_CHARTS } from '@/data/sizeCharts';
import { CATALOG } from '@/data/catalog';
import { formatMeasure, formatRange, isFitProfile, parseMeasurement, recommendSize, toCm } from './sizing';

const TOPS = SIZE_CHARTS.tops;
const BOTTOMS = SIZE_CHARTS.bottoms;
const ALL_TOPS = ['XS', 'S', 'M', 'L', 'XL'];
const WAISTS = ['26', '28', '30', '32', '34'];

describe('units', () => {
  it('converts and rounds like a tape measure', () => {
    expect(toCm(36, 'in')).toBeCloseTo(91.44);
    expect(formatMeasure(94.4, 'cm')).toBe('94');
    expect(formatMeasure(94, 'in')).toBe('37');
    expect(formatMeasure(92, 'in')).toBe('36');
    expect(formatRange([88, 94], 'cm')).toBe('88–94');
    expect(formatRange([88, 94], 'in')).toBe('34.5–37');
  });
});

describe('parseMeasurement', () => {
  it('reads either unit and catches typos', () => {
    expect(parseMeasurement('96', 'chest', 'cm')).toEqual({ ok: true, cm: 96 });
    expect(parseMeasurement('36,5', 'chest', 'in')).toEqual({ ok: true, cm: 36.5 * 2.54 });
    expect(parseMeasurement('', 'waist', 'cm')).toEqual({ ok: false, error: 'Enter your waist measurement' });
    expect(parseMeasurement('about 90', 'chest', 'cm')).toEqual({ ok: false, error: 'Use a number, like 92 or 36.5' });
    expect(parseMeasurement('9', 'chest', 'cm')).toEqual({
      ok: false,
      error: 'That looks off. Most chest measurements are 60–160 cm',
    });
    // 96 inches is a chest typed in the wrong unit.
    expect(parseMeasurement('96', 'chest', 'in')).toMatchObject({ ok: false });
  });
});

describe('recommendSize', () => {
  it('picks the size whose range fits', () => {
    expect(recommendSize(TOPS, { chest: 97 }, 'true', ALL_TOPS)).toEqual({ size: 'M', measured: 'M', between: false, decidedBy: 'chest' });
    expect(recommendSize(TOPS, { chest: 94 }, 'true', ALL_TOPS)?.size).toBe('S');
  });

  it('goes up when between sizes', () => {
    expect(recommendSize(TOPS, { chest: 94.5 }, 'true', ALL_TOPS)).toMatchObject({ size: 'M', between: true });
  });

  it('moves one size for a closer or roomier fit, within what is offered', () => {
    expect(recommendSize(TOPS, { chest: 97 }, 'closer', ALL_TOPS)?.size).toBe('S');
    expect(recommendSize(TOPS, { chest: 97 }, 'roomier', ALL_TOPS)?.size).toBe('L');
    expect(recommendSize(TOPS, { chest: 112 }, 'roomier', ALL_TOPS)?.size).toBe('XL');
    expect(recommendSize(TOPS, { chest: 85 }, 'closer', ['S', 'M', 'L'])).toMatchObject({ size: 'S', outside: 'below' });
  });

  it('only offers the sizes the product comes in', () => {
    expect(recommendSize(TOPS, { chest: 113 }, 'true', ['S', 'M', 'L'])).toMatchObject({ size: 'L', outside: 'above' });
    expect(recommendSize(TOPS, { chest: 97 }, 'true', [])).toBeNull();
    expect(recommendSize(TOPS, {}, 'true', ALL_TOPS)).toBeNull();
  });

  it('lets the larger measurement decide', () => {
    expect(recommendSize(BOTTOMS, { waist: 70, hip: 101 }, 'true', WAISTS)).toMatchObject({ size: '32', decidedBy: 'hip' });
    expect(recommendSize(BOTTOMS, { waist: 80, hip: 92 }, 'true', WAISTS)).toMatchObject({ size: '32', decidedBy: 'waist' });
  });
});

describe('size data', () => {
  it('covers sized products only, and each chart covers every size they come in', () => {
    for (const [productId, fit] of Object.entries(PRODUCT_FITS)) {
      const product = CATALOG.find((candidate) => candidate.id === productId);
      const sizes = product?.options.find((option) => option.name === 'Size')?.values.map((value) => value.value);
      expect(sizes, productId).toBeDefined();
      const charted = SIZE_CHARTS[fit.chart].rows.map((row) => row.size);
      expect(sizes!.every((size) => charted.includes(size)), productId).toBe(true);
    }
  });

  it('has ranges that run upward without overlapping', () => {
    for (const chart of Object.values(SIZE_CHARTS)) {
      for (const measure of chart.measures) {
        const ranges = chart.rows.map((row) => row.ranges[measure]!);
        ranges.forEach(([min, max], index) => {
          expect(min).toBeLessThan(max);
          if (index > 0) expect(min).toBeGreaterThan(ranges[index - 1]![1]);
        });
      }
    }
  });
});

describe('isFitProfile', () => {
  it('accepts saved profiles and rejects anything else', () => {
    expect(isFitProfile({ unit: 'in', values: { chest: '38' }, preference: 'closer' })).toBe(true);
    expect(isFitProfile({ unit: 'ft', values: {}, preference: 'closer' })).toBe(false);
    expect(isFitProfile({ unit: 'cm', values: {}, preference: 'baggy' })).toBe(false);
    expect(isFitProfile(null)).toBe(false);
  });
});
