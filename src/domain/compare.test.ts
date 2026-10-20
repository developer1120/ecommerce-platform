import { CATALOG } from '@/data/catalog';
import {
  compareRows,
  compareUrl,
  MAX_COMPARE,
  parseCompareIds,
  standouts,
  toCompareItem,
  toggleCompare,
  type CompareItem,
} from './compare';
import type { Product } from './product';

const bySlug = (slug: string) => CATALOG.find((product) => product.slug === slug)!;
const shirt = bySlug('relaxed-linen-shirt');
const beanie = bySlug('ribbed-wool-beanie');
const soap = bySlug('cedar-and-vetiver-soap');
const item = (product: Product): CompareItem => toCompareItem(product);

describe('toggleCompare', () => {
  it('adds, removes and stops at four', () => {
    let items: CompareItem[] = [];
    ({ items } = toggleCompare(items, item(shirt)));
    expect(items.map((entry) => entry.id)).toEqual([shirt.id]);
    expect(toggleCompare(items, item(shirt))).toEqual({ items: [], outcome: 'removed' });

    const four = CATALOG.slice(0, MAX_COMPARE).map(item);
    const full = toggleCompare(four, item(CATALOG[MAX_COMPARE]!));
    expect(full.outcome).toBe('full');
    expect(full.items).toBe(four);
    expect(toggleCompare(four, four[0]!).outcome).toBe('removed');
  });
});

describe('compare links', () => {
  it('reads ids from the address, without repeats, up to four', () => {
    expect(parseCompareIds(null)).toEqual([]);
    expect(parseCompareIds(' a, b ,a,,c,d,e')).toEqual(['a', 'b', 'c', 'd']);
    expect(compareUrl(['a', 'b'])).toBe('/compare?ids=a,b');
    expect(compareUrl([])).toBe('/compare');
  });
});

describe('compareRows', () => {
  it('lines up price, details and every option, marking rows that are all the same', () => {
    const rows = compareRows([shirt, beanie]);
    const labels = rows.map((row) => row.label);
    expect(labels.slice(0, 5)).toEqual(['Price', 'Rating', 'Maker', 'Department', 'Type']);
    expect(labels.slice(-2)).toEqual(['Availability', 'Details']);
    for (const option of [...shirt.options, ...beanie.options]) expect(labels).toContain(option.name);

    const department = rows.find((row) => row.label === 'Department')!;
    expect(department.values).toEqual([['Apparel'], ['Apparel']]);
    expect(department.same).toBe(true);
    expect(rows.find((row) => row.label === 'Price')!.same).toBe(false);
    expect(rows.find((row) => row.label === 'Details')!.values[0]).toEqual(shirt.details);
  });

  it('shows a dash for an option a product does not have', () => {
    const rows = compareRows([shirt, soap]);
    const sizeLike = shirt.options.find((option) => !soap.options.some((other) => other.name === option.name))!;
    expect(rows.find((row) => row.label === sizeLike.name)!.values[1]).toEqual(['—']);
  });

  it('describes price, sale price, rating and availability in words', () => {
    const product: Product = {
      ...soap,
      compareAtPrice: 1500,
      rating: { average: 4.25, count: 1 },
      variants: soap.variants.map((variant) => ({ ...variant, stock: 2 })),
    };
    const [row] = compareRows([product]).filter((entry) => entry.label === 'Price');
    expect(row!.values[0]).toEqual(['$12.00 (was $15.00)']);
    const values = Object.fromEntries(compareRows([product]).map((entry) => [entry.label, entry.values[0]![0]]));
    expect(values.Rating).toBe('4.3 out of 5 (1 rating)');
    expect(values.Availability).toBe(`Only ${2 * soap.variants.length} left`);
    expect(compareRows([{ ...soap, rating: { average: 0, count: 0 } }])[1]!.values[0]).toEqual(['No ratings yet']);
  });

  it('never calls a row "the same" with one product', () => {
    expect(compareRows([shirt]).every((row) => !row.same)).toBe(true);
  });
});

describe('standouts', () => {
  it('names the cheapest and the best rated when there is a single one', () => {
    const cheap = { ...soap, rating: { average: 3.9, count: 10 } };
    const loved = { ...shirt, rating: { average: 4.9, count: 10 } };
    expect(standouts([cheap, loved])).toEqual({ cheapest: soap.id, topRated: shirt.id });
  });

  it('names nobody on a tie or with one product', () => {
    expect(standouts([soap])).toEqual({ cheapest: null, topRated: null });
    const twin = { ...soap, id: 'twin', rating: soap.rating };
    expect(standouts([soap, twin])).toEqual({ cheapest: null, topRated: null });
  });
});
