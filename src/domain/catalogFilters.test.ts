import { CATALOG } from '@/data/catalog';
import { defineProduct, type ProductSeed } from '@/data/defineProduct';
import {
  activeFilterCount,
  applyFilters,
  buildFacets,
  EMPTY_FILTERS,
  filterAndSort,
  parseFilters,
  serializeFilters,
  sortProducts,
  type CatalogFilters,
} from './catalogFilters';

function filters(overrides: Partial<CatalogFilters> = {}): CatalogFilters {
  return { ...EMPTY_FILTERS, ...overrides };
}

function product(code: string, overrides: Partial<ProductSeed> = {}) {
  return defineProduct({
    code,
    slug: code.toLowerCase(),
    name: code,
    maker: 'Maker',
    department: 'apparel',
    type: 'Tops',
    summary: '',
    description: '',
    details: [],
    price: 3000,
    tags: [],
    rating: { average: 4.2, count: 10 },
    addedAt: '2026-01-01',
    art: { tint: 'lilac', motif: 'garment' },
    stock: 5,
    ...overrides,
  });
}

const twoColors = {
  options: [
    {
      name: 'Color',
      values: [
        { value: 'Oat', swatch: '#eee' },
        { value: 'Ink', swatch: '#222' },
      ],
    },
  ],
};

const tee = product('TEE', { ...twoColors, stock: [4, 0], price: 2000, rating: { average: 4.6, count: 90 }, addedAt: '2026-09-01' });
const coat = product('COAT', { type: 'Outerwear', price: 18000, rating: { average: 4.8, count: 12 }, addedAt: '2026-08-01' });
const socks = product('SOCKS', { type: 'Accessories', price: 1200, stock: 0, rating: { average: 3.9, count: 40 } });
const shirt = product('SHIRT', { ...twoColors, stock: [0, 3], price: 5000, rating: { average: 4.6, count: 200 }, addedAt: '2026-10-01' });
const items = [tee, coat, socks, shirt];

const ids = (products: { id: string }[]) => products.map((p) => p.id);

describe('URL round trip', () => {
  it('reads every kind of filter from the query string', () => {
    const parsed = parseFilters(
      new URLSearchParams('type=Tops&type=Bags&color=Ink&price=25-50&price=under-25&stock=in&rating=4.5&sort=price-desc'),
    );
    expect(parsed).toEqual({
      types: ['Tops', 'Bags'],
      colors: ['Ink'],
      prices: ['25-50', 'under-25'],
      inStock: true,
      minRating: 4.5,
      sort: 'price-desc',
    });
  });

  it('drops values it does not recognise', () => {
    const parsed = parseFilters(new URLSearchParams('price=cheap&rating=7&sort=random&stock=maybe&type=&color=Ink&color=Ink'));
    expect(parsed).toEqual({ ...EMPTY_FILTERS, colors: ['Ink'] });
  });

  it('writes nothing for the defaults', () => {
    expect(serializeFilters(EMPTY_FILTERS).toString()).toBe('');
  });

  it('writes a stable order so equal filters give equal URLs', () => {
    const a = serializeFilters(filters({ types: ['Tops', 'Bags'], prices: ['50-100', 'under-25'], sort: 'newest' }));
    const b = serializeFilters(filters({ types: ['Bags', 'Tops'], prices: ['under-25', '50-100'], sort: 'newest' }));
    expect(a.toString()).toBe(b.toString());
    expect(a.toString()).toBe('type=Bags&type=Tops&price=under-25&price=50-100&sort=newest');
  });

  it('survives a round trip', () => {
    const original = filters({ types: ['Tops'], colors: ['Oat', 'Ink'], prices: ['100-plus'], inStock: true, minRating: 4, sort: 'rating' });
    const roundTripped = parseFilters(serializeFilters(original));
    expect(roundTripped).toEqual({ ...original, colors: ['Ink', 'Oat'] });
  });

  it('encodes values with spaces', () => {
    const params = serializeFilters(filters({ types: ['Hair care'] }));
    expect(params.toString()).toBe('type=Hair+care');
    expect(parseFilters(params).types).toEqual(['Hair care']);
  });
});

describe('applyFilters', () => {
  it('returns everything with no filters', () => {
    expect(applyFilters(items, EMPTY_FILTERS)).toEqual(items);
  });

  it('ORs values within a filter and ANDs different filters', () => {
    expect(ids(applyFilters(items, filters({ types: ['Outerwear', 'Accessories'] })))).toEqual(['coat', 'socks']);
    expect(ids(applyFilters(items, filters({ types: ['Tops'], prices: ['under-25'] })))).toEqual(['tee']);
  });

  it('matches price bands on the lowest price, including the lower bound only', () => {
    expect(ids(applyFilters(items, filters({ prices: ['25-50'] })))).toEqual([]);
    expect(ids(applyFilters(items, filters({ prices: ['50-100'] })))).toEqual(['shirt']);
    expect(ids(applyFilters(items, filters({ prices: ['100-plus'] })))).toEqual(['coat']);
  });

  it('keeps only products with stock', () => {
    expect(ids(applyFilters(items, filters({ inStock: true })))).toEqual(['tee', 'coat', 'shirt']);
  });

  it('requires the chosen color itself to be in stock when both apply', () => {
    // The tee's Ink is sold out; the shirt's Ink has stock.
    expect(ids(applyFilters(items, filters({ colors: ['Ink'] })))).toEqual(['tee', 'shirt']);
    expect(ids(applyFilters(items, filters({ colors: ['Ink'], inStock: true })))).toEqual(['shirt']);
    expect(ids(applyFilters(items, filters({ colors: ['Oat'], inStock: true })))).toEqual(['tee']);
  });

  it('applies a minimum rating', () => {
    expect(ids(applyFilters(items, filters({ minRating: 4.5 })))).toEqual(['tee', 'coat', 'shirt']);
    expect(ids(applyFilters(items, filters({ minRating: 4 })))).toEqual(['tee', 'coat', 'shirt']);
  });
});

describe('sortProducts', () => {
  it('keeps the catalog order for featured', () => {
    expect(ids(sortProducts(items, 'featured'))).toEqual(['tee', 'coat', 'socks', 'shirt']);
  });

  it('sorts by price both ways', () => {
    expect(ids(sortProducts(items, 'price-asc'))).toEqual(['socks', 'tee', 'shirt', 'coat']);
    expect(ids(sortProducts(items, 'price-desc'))).toEqual(['coat', 'shirt', 'tee', 'socks']);
  });

  it('sorts newest first', () => {
    expect(ids(sortProducts(items, 'newest'))).toEqual(['shirt', 'tee', 'coat', 'socks']);
  });

  it('sorts by rating, then by number of reviews', () => {
    expect(ids(sortProducts(items, 'rating'))).toEqual(['coat', 'shirt', 'tee', 'socks']);
  });

  it('keeps ties in catalog order', () => {
    const a = product('A', { price: 1000 });
    const b = product('B', { price: 1000 });
    const c = product('C', { price: 1000 });
    expect(ids(sortProducts([b, c, a], 'price-asc'))).toEqual(['b', 'c', 'a']);
  });

  it('does not change the input array', () => {
    const input = [...items];
    sortProducts(input, 'price-asc');
    expect(input).toEqual(items);
  });
});

describe('buildFacets', () => {
  it('lists the types and colors present, alphabetically', () => {
    const facets = buildFacets(items, EMPTY_FILTERS);
    expect(facets.types.map((t) => t.value)).toEqual(['Accessories', 'Outerwear', 'Tops']);
    expect(facets.colors.map((c) => [c.value, c.swatch])).toEqual([
      ['Ink', '#222'],
      ['Oat', '#eee'],
    ]);
  });

  it('counts what each choice would show, given the other filters', () => {
    const facets = buildFacets(items, filters({ types: ['Tops'], inStock: true }));
    // Type counts ignore the type filter itself but respect "in stock".
    expect(facets.types.find((t) => t.value === 'Accessories')?.count).toBe(0);
    expect(facets.types.find((t) => t.value === 'Outerwear')?.count).toBe(1);
    // Color counts respect the type filter and in-stock colors.
    expect(facets.colors.find((c) => c.value === 'Ink')?.count).toBe(1);
    expect(facets.colors.find((c) => c.value === 'Oat')?.count).toBe(1);
    // The in-stock count ignores the in-stock filter itself.
    expect(facets.inStock).toBe(2);
  });

  it('counts price bands and rating thresholds', () => {
    const facets = buildFacets(items, EMPTY_FILTERS);
    expect(facets.prices.map((p) => p.count)).toEqual([2, 0, 1, 1]);
    expect(facets.ratings).toEqual([
      { value: 4, count: 3 },
      { value: 4.5, count: 3 },
    ]);
  });
});

describe('activeFilterCount', () => {
  it('counts each narrowing choice but not the sort order', () => {
    expect(activeFilterCount(filters({ sort: 'newest' }))).toBe(0);
    expect(activeFilterCount(filters({ types: ['A', 'B'], colors: ['Ink'], inStock: true, minRating: 4 }))).toBe(5);
  });
});

describe('with the real catalog', () => {
  it('finds in-stock ink apparel under $100, cheapest first', () => {
    const apparel = CATALOG.filter((p) => p.department === 'apparel');
    const result = filterAndSort(apparel, filters({ colors: ['Ink'], prices: ['25-50', '50-100'], inStock: true, sort: 'price-asc' }));
    expect(result.map((p) => p.name)).toEqual(['Organic cotton tee', 'Wide-leg cord trousers', 'Relaxed linen shirt']);
  });
});
