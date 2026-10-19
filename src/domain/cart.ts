import { sumCents, multiplyCents, type Cents } from './money';
import { selectedSwatch, variantPrice, type Product, type ProductArt, type Variant } from './product';

/*
 * The bag. Each line is one variant with a snapshot of what the shopper saw
 * when adding it (name, price, art), so the bag renders without reloading
 * the catalog. Checkout re-prices against the catalog later.
 */

/** No line can hold more than this, whatever the stock. */
export const MAX_PER_LINE = 10;

export interface CartLine {
  variantId: string;
  productId: string;
  slug: string;
  name: string;
  maker: string;
  sku: string;
  /** Chosen option values, e.g. { Color: 'Oat', Size: 'M' }. */
  options: Record<string, string>;
  unitPrice: Cents;
  /** The pre-sale price, when the product was on sale. */
  compareAtPrice?: Cents;
  art: ProductArt;
  swatch?: string;
  /** Units in stock when added; caps the quantity. */
  stock: number;
  quantity: number;
  addedAt: string;
}

export interface CartState {
  lines: CartLine[];
}

export const EMPTY_CART: CartState = { lines: [] };

export type CartAction =
  | { type: 'add'; line: Omit<CartLine, 'quantity'>; quantity: number }
  | { type: 'setQuantity'; variantId: string; quantity: number }
  | { type: 'remove'; variantId: string }
  | { type: 'clear' }
  /** Replaces the whole state, e.g. when another tab changed the bag. */
  | { type: 'replace'; state: CartState };

/** The most of a line the shopper may have: stock on hand, capped at MAX_PER_LINE. */
export function maxQuantity(line: Pick<CartLine, 'stock'>): number {
  return Math.max(0, Math.min(line.stock, MAX_PER_LINE));
}

function clamp(quantity: number, line: Pick<CartLine, 'stock'>): number {
  return Math.min(Math.max(0, Math.floor(quantity)), maxQuantity(line));
}

export function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'add': {
      if (!Number.isFinite(action.quantity) || action.quantity <= 0) return state;
      const existing = state.lines.find((line) => line.variantId === action.line.variantId);
      if (existing) {
        // Refresh the snapshot (price or stock may have changed) and add to the quantity.
        const merged = { ...existing, ...action.line, addedAt: existing.addedAt };
        const quantity = clamp(existing.quantity + action.quantity, merged);
        // Stock may have run out since the line was added.
        if (quantity === 0) return { lines: state.lines.filter((line) => line !== existing) };
        return { lines: state.lines.map((line) => (line === existing ? { ...merged, quantity } : line)) };
      }
      const quantity = clamp(action.quantity, action.line);
      if (quantity === 0) return state;
      return { lines: [...state.lines, { ...action.line, quantity }] };
    }

    case 'setQuantity': {
      if (!Number.isFinite(action.quantity)) return state;
      const target = state.lines.find((line) => line.variantId === action.variantId);
      if (!target) return state;
      const quantity = clamp(action.quantity, target);
      if (quantity === 0) return cartReducer(state, { type: 'remove', variantId: action.variantId });
      if (quantity === target.quantity) return state;
      return { lines: state.lines.map((line) => (line === target ? { ...line, quantity } : line)) };
    }

    case 'remove': {
      const lines = state.lines.filter((line) => line.variantId !== action.variantId);
      return lines.length === state.lines.length ? state : { lines };
    }

    case 'clear':
      return state.lines.length === 0 ? state : EMPTY_CART;

    case 'replace':
      return action.state;
  }
}

/** A bag line for a product variant, ready to add. */
export function makeCartLine(product: Product, variant: Variant, now = new Date()): Omit<CartLine, 'quantity'> {
  const unitPrice = variantPrice(product, variant);
  // A sale compare-at price only applies to variants at the product's base price.
  const compareAtPrice =
    variant.price === undefined && product.compareAtPrice !== undefined && product.compareAtPrice > unitPrice
      ? product.compareAtPrice
      : undefined;
  const swatch = selectedSwatch(product, variant);
  return {
    variantId: variant.id,
    productId: product.id,
    slug: product.slug,
    name: product.name,
    maker: product.maker,
    sku: variant.sku,
    options: variant.options,
    unitPrice,
    ...(compareAtPrice !== undefined && { compareAtPrice }),
    art: product.art,
    ...(swatch !== undefined && { swatch }),
    stock: variant.stock,
    addedAt: now.toISOString(),
  };
}

export function lineTotal(line: CartLine): Cents {
  return multiplyCents(line.unitPrice, line.quantity);
}

export function itemCount(state: CartState): number {
  return state.lines.reduce((total, line) => total + line.quantity, 0);
}

export function subtotal(state: CartState): Cents {
  return sumCents(state.lines.map(lineTotal));
}

/** How much the sale prices in the bag save against their compare-at prices. */
export function savings(state: CartState): Cents {
  return sumCents(
    state.lines.map((line) =>
      line.compareAtPrice ? multiplyCents(line.compareAtPrice - line.unitPrice, line.quantity) : 0,
    ),
  );
}

/** "Oat / M", for showing a line's chosen options. */
export function describeOptions(options: Record<string, string>): string {
  return Object.values(options).join(' / ');
}
