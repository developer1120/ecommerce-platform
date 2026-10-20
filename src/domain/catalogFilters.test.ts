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
