import { CATALOG } from '@/data/catalog';
import {
  buildProduct,
  draftFromProduct,
  EMPTY_DRAFT,
  parseOptions,
  slugify,
  variantsForOptions,
  type ProductDraft,
} from './productForm';

const NOW = new Date('2026-10-07T19:00:00Z');

function draft(overrides: Partial<ProductDraft> = {}): ProductDraft {
  return {
    ...EMPTY_DRAFT,
    name: 'Ash serving board',
    maker: 'Hollow Kiln',
    type: 'Kitchen',
    summary: 'A long board for bread and cheese.',
    price: '58',
    ...overrides,
  };
}

describe('slugify', () => {
  it('makes a web address from a name', () => {
    expect(slugify('Wool bouclé cushion')).toBe('wool-boucle-cushion');
    expect(slugify('  Hand-thrown  mug (large)! ')).toBe('hand-thrown-mug-large');
    expect(slugify('!!!')).toBe('');
  });
});

describe('parseOptions', () => {
  it('reads one option per line and skips blanks', () => {
    expect(parseOptions('Color: Oat, Ink, Oat\n\n Size : S,M ')).toEqual([
      { name: 'Color', values: [{ value: 'Oat' }, { value: 'Ink' }] },
      { name: 'Size', values: [{ value: 'S' }, { value: 'M' }] },
    ]);
    expect(parseOptions('')).toEqual([]);
  });

  it('explains what is wrong', () => {
    expect(parseOptions('Color Oat')).toMatch(/missing a colon/);
    expect(parseOptions('Color: , ,')).toBe('Give Color at least one value.');
    expect(parseOptions('Color: Oat\ncolor: Ink')).toBe('color is listed twice.');
    expect(parseOptions('A: 1\nB: 2\nC: 3')).toMatch(/at most two/);
  });
});

describe('variantsForOptions', () => {
  it('keeps stock typed for combinations that remain', () => {
    const first = variantsForOptions(parseOptions('Color: Oat, Ink') as never, []);
    const typed = first.map((row) => (row.options.Color === 'Ink' ? { ...row, stock: '7' } : row));
    const next = variantsForOptions(parseOptions('Color: Oat, Ink, Moss') as never, typed);
    expect(next.map((row) => [row.options.Color, row.stock])).toEqual([
      ['Oat', '0'],
      ['Ink', '7'],
      ['Moss', '0'],
    ]);
  });

  it('gives a product without options a single row', () => {
    expect(variantsForOptions([], [])).toEqual([{ id: '', options: {}, stock: '0', price: '' }]);
  });
});

describe('buildProduct', () => {
  it('builds a new product with generated codes', () => {
    const options = parseOptions('Wood: Ash, Oak') as never;
    const result = buildProduct(
      draft({ optionsText: 'Wood: Ash, Oak', variants: variantsForOptions(options, []).map((row) => ({ ...row, stock: '3' })), compareAtPrice: '72', tags: 'Kitchen, gift, kitchen' }),
      null,
      CATALOG,
      NOW,
    );
    expect(result.errors).toBeUndefined();
    const product = result.product!;
    expect(product).toMatchObject({
      id: 'ash-serving-board',
      slug: 'ash-serving-board',
      price: 5800,
      compareAtPrice: 7200,
      tags: ['kitchen', 'gift'],
      description: 'A long board for bread and cheese.',
      rating: { average: 0, count: 0 },
      addedAt: '2026-10-07',
      status: 'draft',
      updatedAt: NOW.toISOString(),
    });
    expect(product.variants.map((variant) => [variant.id, variant.sku, variant.stock])).toEqual([
      ['ash-serving-board-ash', 'ASH-SERVING-ASH', 3],
      ['ash-serving-board-oak', 'ASH-SERVING-OAK', 3],
    ]);
  });

  it('refuses variant codes another product already uses', () => {
    const taken = CATALOG.find((candidate) => candidate.options.length === 0)!.variants[0]!.id;
    const result = buildProduct(draft({ name: 'Something new', slug: taken }), null, CATALOG, NOW);
    expect(result.errors?.variants).toMatch(/Another product already uses these variant codes/);
  });

  it('collects every problem at once', () => {
    const taken = CATALOG[0]!;
    const result = buildProduct(
      draft({ name: '', slug: taken.slug, maker: ' ', type: '', summary: '', price: '40', compareAtPrice: '30', optionsText: 'Size' }),
      null,
      CATALOG,
      NOW,
    );
    expect(result.errors).toEqual({
      name: 'Enter a product name',
      slug: `Another product already uses /product/${taken.slug}`,
      maker: 'Enter the maker',
      type: 'Enter a product type, such as Tableware',
      summary: 'Write a one-line summary',
      compareAtPrice: 'The previous price must be higher than the price',
      optionsText: expect.stringMatching(/missing a colon/),
    });
  });

  it('rejects a missing price and bad variant rows', () => {
    expect(buildProduct(draft({ price: '' }), null, CATALOG, NOW).errors?.price).toBe('Enter a price, like 38.00');
    expect(buildProduct(draft({ price: '0' }), null, CATALOG, NOW).errors?.price).toBe('Enter a price, like 38.00');
    const badStock = draft({ variants: [{ id: '', options: {}, stock: '2.5', price: '' }] });
    expect(buildProduct(badStock, null, CATALOG, NOW).errors?.variants).toBe('Row 1: stock must be a whole number');
    const badPrice = draft({ variants: [{ id: '', options: {}, stock: '2', price: 'free' }] });
    expect(buildProduct(badPrice, null, CATALOG, NOW).errors?.variants).toMatch(/Row 1: enter a price/);
  });

  it('round-trips an existing product unchanged apart from its edit time', () => {
    for (const product of CATALOG) {
      const result = buildProduct(draftFromProduct(product), product, CATALOG, NOW);
      expect(result.errors).toBeUndefined();
      expect({ ...result.product, status: undefined, updatedAt: undefined }).toEqual({ ...product, status: undefined, updatedAt: undefined });
    }
  });

  it('keeps an existing product its own address and options', () => {
    const product = CATALOG.find((candidate) => candidate.options.length > 0)!;
    const result = buildProduct({ ...draftFromProduct(product), optionsText: 'Nonsense' }, product, CATALOG, NOW);
    expect(result.product?.options).toEqual(product.options);
    expect(result.product?.id).toBe(product.id);
  });
});
