import type { Cents } from '@/domain/money';
import type { Product, ProductOption, Variant } from '@/domain/product';

export interface ProductSeed extends Omit<Product, 'id' | 'variants' | 'options'> {
  /** Short code used for the id and every SKU, e.g. "HK-MUG". */
  code: string;
  options?: ProductOption[];
  /**
   * Units on hand per variant, in the order the option combinations are listed
   * (first option varies slowest). A single number applies to every variant.
   */
  stock: number | number[];
  /** Variant prices keyed by an option value, e.g. { '400 ml': 3400 }. */
  pricesByValue?: Record<string, Cents>;
}

/** Every combination of option values, first option varying slowest. */
export function combinations(options: ProductOption[]): Record<string, string>[] {
  return options.reduce<Record<string, string>[]>(
    (combos, option) => combos.flatMap((combo) => option.values.map(({ value }) => ({ ...combo, [option.name]: value }))),
    [{}],
  );
}

function skuPart(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
    .slice(0, 4);
}

export function defineProduct(seed: ProductSeed): Product {
  const { code, options = [], stock, pricesByValue, ...product } = seed;
  const combos = combinations(options);

  if (Array.isArray(stock) && stock.length !== combos.length) {
    throw new Error(`${code}: ${stock.length} stock entries for ${combos.length} variants`);
  }

  const variants: Variant[] = combos.map((combo, index) => {
    const values = Object.values(combo);
    const sku = [code, ...values.map(skuPart)].join('-');
    const price = values.map((value) => pricesByValue?.[value]).find((override) => override !== undefined);
    return {
      id: sku.toLowerCase(),
      sku,
      options: combo,
      stock: Array.isArray(stock) ? (stock[index] ?? 0) : stock,
      ...(price !== undefined && { price }),
    };
  });

  return { ...product, id: code.toLowerCase(), options, variants };
}
