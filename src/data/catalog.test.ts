import { NAV_CATEGORIES } from '@/config/navigation';
import { DEPARTMENTS, inCollection, isCollectionSlug, isInStock, isNewArrival, isOnSale, stockLevel } from '@/domain/product';
import { CATALOG } from './catalog';

const NOW = new Date('2026-10-07T12:00:00Z');

function duplicates(values: string[]): string[] {
  return values.filter((value, index) => values.indexOf(value) !== index);
}

describe('sample catalog', () => {
  it('has unique ids, slugs and SKUs', () => {
    expect(duplicates(CATALOG.map((product) => product.id))).toEqual([]);
    expect(duplicates(CATALOG.map((product) => product.slug))).toEqual([]);
    expect(duplicates(CATALOG.flatMap((product) => product.variants.map((variant) => variant.sku)))).toEqual([]);
  });

  it('uses URL-safe slugs', () => {
    for (const product of CATALOG) expect(product.slug, product.name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it.each(CATALOG.map((product) => [product.name, product] as const))('%s has valid prices, rating and date', (_, product) => {
    expect(Number.isInteger(product.price) && product.price > 0).toBe(true);
    if (product.compareAtPrice !== undefined) expect(product.compareAtPrice).toBeGreaterThan(product.price);
    for (const variant of product.variants) {
      if (variant.price !== undefined) expect(Number.isInteger(variant.price) && variant.price > 0).toBe(true);
      expect(Number.isInteger(variant.stock) && variant.stock >= 0).toBe(true);
    }
    expect(product.rating.average).toBeGreaterThanOrEqual(0);
    expect(product.rating.average).toBeLessThanOrEqual(5);
    expect(Number.isNaN(new Date(product.addedAt).getTime())).toBe(false);
  });

  it('gives every variant a value for each option, drawn from that option', () => {
    for (const product of CATALOG) {
      for (const variant of product.variants) {
        expect(Object.keys(variant.options).sort()).toEqual(product.options.map((option) => option.name).sort());
        for (const option of product.options) {
          expect(option.values.map((value) => value.value)).toContain(variant.options[option.name]);
        }
      }
    }
  });

  it('stocks every department', () => {
    for (const department of DEPARTMENTS) {
      expect(CATALOG.filter((product) => product.department === department).length).toBeGreaterThanOrEqual(5);
    }
  });

  it('covers the states the storefront has to show', () => {
    expect(CATALOG.some(isOnSale)).toBe(true);
    expect(CATALOG.some((product) => isNewArrival(product, NOW))).toBe(true);
    expect(CATALOG.some((product) => !isInStock(product))).toBe(true);
    expect(CATALOG.some((product) => product.variants.some((variant) => stockLevel(variant.stock) === 'low'))).toBe(true);
    expect(CATALOG.some((product) => product.options.length >= 2)).toBe(true);
  });

  it('has products in every collection the header links to', () => {
    for (const { slug } of NAV_CATEGORIES) {
      expect(isCollectionSlug(slug)).toBe(true);
      if (isCollectionSlug(slug)) {
        expect(CATALOG.filter((product) => inCollection(product, slug, NOW)).length, slug).toBeGreaterThan(0);
      }
    }
  });
});
