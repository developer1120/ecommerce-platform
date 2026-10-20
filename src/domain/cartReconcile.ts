import { makeCartLine, MAX_PER_LINE, type CartLine, type CartState } from './cart';
import { formatMoney } from './money';
import type { Product } from './product';

/*
 * A saved bag can go stale: prices change, stock sells, products are
 * withdrawn. Reconciling compares every line with the live catalog and
 * returns the corrected bag plus a note for each change, so the shopper is
 * never surprised at checkout.
 */

export type CartNoticeKind = 'removed' | 'sold-out' | 'quantity-reduced' | 'price-up' | 'price-down';

export interface CartNotice {
  variantId: string;
  name: string;
  kind: CartNoticeKind;
  message: string;
}

export interface ReconcileResult {
  state: CartState;
  notices: CartNotice[];
  /** False when nothing needed correcting. */
  changed: boolean;
}

export function reconcileCart(state: CartState, products: Product[]): ReconcileResult {
  const notices: CartNotice[] = [];
  const lines: CartLine[] = [];
  let changed = false;

  for (const line of state.lines) {
    const product = products.find((candidate) => candidate.id === line.productId);
    const variant = product?.variants.find((candidate) => candidate.id === line.variantId);
    const label = describe(line);

    if (!product || !variant) {
      changed = true;
      notices.push({ variantId: line.variantId, name: line.name, kind: 'removed', message: `${label} is no longer available, so we removed it.` });
      continue;
    }

    if (variant.stock <= 0) {
      changed = true;
      notices.push({ variantId: line.variantId, name: line.name, kind: 'sold-out', message: `${label} has sold out, so we removed it.` });
      continue;
    }

    // Refresh the snapshot from the catalog, keeping the shopper's quantity and when they added it.
    const fresh: CartLine = { ...makeCartLine(product, variant), addedAt: line.addedAt, quantity: line.quantity };
    const allowed = Math.min(variant.stock, MAX_PER_LINE);
    if (fresh.quantity > allowed) {
      fresh.quantity = allowed;
      notices.push({
        variantId: line.variantId,
        name: line.name,
        kind: 'quantity-reduced',
        message: `Only ${allowed} of ${label} ${allowed === 1 ? 'is' : 'are'} left, so we lowered your quantity.`,
      });
    }

    if (fresh.unitPrice !== line.unitPrice) {
      const up = fresh.unitPrice > line.unitPrice;
      notices.push({
        variantId: line.variantId,
        name: line.name,
        kind: up ? 'price-up' : 'price-down',
        message: `${label} ${up ? 'went up' : 'dropped'} from ${formatMoney(line.unitPrice)} to ${formatMoney(fresh.unitPrice)}.`,
      });
    }

    if (!sameLine(line, fresh)) changed = true;
    lines.push(fresh);
  }

  return { state: changed ? { lines } : state, notices, changed };
}

function describe(line: CartLine): string {
  const options = Object.values(line.options).join(' / ');
  return options ? `${line.name} (${options})` : line.name;
}

function sameLine(a: CartLine, b: CartLine): boolean {
  return (
    a.quantity === b.quantity &&
    a.unitPrice === b.unitPrice &&
    a.compareAtPrice === b.compareAtPrice &&
    a.stock === b.stock &&
    a.name === b.name &&
    a.swatch === b.swatch
  );
}
