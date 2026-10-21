import { combinations, defineProduct, type ProductSeed } from '@/data/defineProduct';
import {
  defaultVariant,
  findVariant,
  inCollection,
  isCollectionSlug,
  isInStock,
  isNewArrival,
  isOnSale,
  priceRange,
  productDiscountPercent,
  stockLevel,
  totalStock,
  variantPrice,
} from './product';

const NOW = new Date('2026-10-07T12:00:00Z');

function seed(overrides: Partial<ProductSeed> = {}): ProductSeed {
  return {
    code: 'T-TEST',
    slug: 'test-product',
    name: 'Test product',
    maker: 'Test maker',
    department: 'home',
    type: 'Decor',
    summary: 'A test product.',
    description: 'A test product.',
    details: [],
    price: 2000,
    tags: [],
    rating: { average: 4, count: 1 },
    addedAt: '2026-01-01',
    art: { tint: 'lilac', motif: 'vessel' },
    stock: 5,
    ...overrides,
  };
}

const shirt = defineProduct(
  seed({
    code: 'T-SHIRT',
    options: [
      { name: 'Color', values: [{ value: 'Oat' }, { value: 'Ink' }] },
      { name: 'Size', values: [{ value: 'S' }, { value: 'M' }] },
    ],
    stock: [0, 4, 9, 0],
  }),
);

describe('defineProduct', () => {
  it('builds one variant per option combination, first option varying slowest', () => {
    expect(shirt.variants.map((variant) => variant.options)).toEqual([
      { Color: 'Oat', Size: 'S' },
      { Color: 'Oat', Size: 'M' },
      { Color: 'Ink', Size: 'S' },
      { Color: 'Ink', Size: 'M' },
    ]);
    expect(shirt.variants.map((variant) => variant.stock)).toEqual([0, 4, 9, 0]);
  });

  it('derives the id and SKUs from the product code', () => {
    expect(shirt.id).toBe('t-shirt');
    expect(shirt.variants[1]).toMatchObject({ sku: 'T-SHIRT-OAT-M', id: 't-shirt-oat-m' });
  });

  it('gives a product without options a single variant', () => {
    const plain = defineProduct(seed({ stock: 7 }));
    expect(plain.variants).toEqual([{ id: 't-test', sku: 'T-TEST', options: {}, stock: 7 }]);
  });

  it('applies variant prices by option value', () => {
    const lotion = defineProduct(
      seed({
        options: [{ name: 'Size', values: [{ value: '200 ml' }, { value: '400 ml' }] }],
        pricesByValue: { '400 ml': 3600 },
        stock: 1,
      }),
    );
    expect(lotion.variants.map((variant) => variantPrice(lotion, variant))).toEqual([2000, 3600]);
    expect(priceRange(lotion)).toEqual({ min: 2000, max: 3600 });
  });

  it('refuses a stock list that does not match the variants', () => {
    expect(() => defineProduct(seed({ options: shirt.options, stock: [1, 2] }))).toThrow(/2 stock entries for 4/);
  });

  it('lists combinations for no options as a single empty selection', () => {
    expect(combinations([])).toEqual([{}]);
  });
});

describe('stock', () => {
  it('grades stock levels around the low-stock threshold', () => {
    expect(stockLevel(0)).toBe('out');
    expect(stockLevel(-2)).toBe('out');
    expect(stockLevel(1)).toBe('low');
    expect(stockLevel(5)).toBe('low');
    expect(stockLevel(6)).toBe('in');
  });

  it('totals stock across variants and ignores negative counts', () => {
    expect(totalStock(shirt)).toBe(13);
    const oversold = defineProduct(seed({ options: [{ name: 'Size', values: [{ value: 'S' }, { value: 'M' }] }], stock: [-3, 2] }));
    expect(totalStock(oversold)).toBe(2);
  });

  it('is out of stock only when every variant is', () => {
    expect(isInStock(shirt)).toBe(true);
    expect(isInStock(defineProduct(seed({ stock: 0 })))).toBe(false);
  });

  it('defaults to the first variant that can be bought', () => {
    expect(defaultVariant(shirt).options).toEqual({ Color: 'Oat', Size: 'M' });
    const soldOut = defineProduct(seed({ stock: 0 }));
    expect(defaultVariant(soldOut)).toBe(soldOut.variants[0]);
  });
});

describe('findVariant', () => {
  it('matches a full selection', () => {
    expect(findVariant(shirt, { Color: 'Ink', Size: 'S' })?.sku).toBe('T-SHIRT-INK-S');
  });

  it('finds nothing for a partial or unknown selection', () => {
    expect(findVariant(shirt, { Color: 'Ink' })).toBeUndefined();
    expect(findVariant(shirt, { Color: 'Lime', Size: 'S' })).toBeUndefined();
  });
});

describe('sale and new arrivals', () => {
  it('is on sale only with a higher compare-at price', () => {
    const sale = defineProduct(seed({ price: 3840, compareAtPrice: 4800 }));
    expect(isOnSale(sale)).toBe(true);
    expect(productDiscountPercent(sale)).toBe(20);
    expect(isOnSale(defineProduct(seed({ compareAtPrice: 2000 })))).toBe(false);
    expect(isOnSale(defineProduct(seed()))).toBe(false);
  });

  it('counts products added in the last 30 days as new', () => {
    expect(isNewArrival(defineProduct(seed({ addedAt: '2026-10-01' })), NOW)).toBe(true);
    expect(isNewArrival(defineProduct(seed({ addedAt: '2026-09-08' })), NOW)).toBe(true);
    expect(isNewArrival(defineProduct(seed({ addedAt: '2026-09-01' })), NOW)).toBe(false);
    // Scheduled products are not new yet.
    expect(isNewArrival(defineProduct(seed({ addedAt: '2026-11-01' })), NOW)).toBe(false);
  });

  it('places products in department and computed collections', () => {
    const product = defineProduct(seed({ department: 'beauty', price: 1000, compareAtPrice: 1500, addedAt: '2026-10-05' }));
    expect(inCollection(product, 'beauty', NOW)).toBe(true);
    expect(inCollection(product, 'home', NOW)).toBe(false);
    expect(inCollection(product, 'sale', NOW)).toBe(true);
    expect(inCollection(product, 'new', NOW)).toBe(true);
  });

  it('recognises collection slugs', () => {
    expect(['new', 'sale', 'home', 'apparel', 'beauty'].every(isCollectionSlug)).toBe(true);
    expect(isCollectionSlug('garden')).toBe(false);
    expect(isCollectionSlug(undefined)).toBe(false);
  });
});
