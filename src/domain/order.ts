import type { ShippingAddress } from './address';
import type { CartLine } from './cart';
import type { Cents } from './money';
import type { SavedCard } from './payment';
import type { ShippingMethodId } from './shipping';

export type OrderStatus = 'placed' | 'packed' | 'shipped' | 'delivered' | 'cancelled';

export interface OrderTotalsSnapshot {
  subtotal: Cents;
  discount: Cents;
  shipping: Cents;
  tax: Cents;
  /** Thousandths of a percent, as in the tax table. */
  taxRate: number;
  total: Cents;
}

export interface Order {
  /** Also the order number shown to the shopper, e.g. "OR-261011-K7F3". */
  id: string;
  placedAt: string;
  status: OrderStatus;
  email: string;
  address: ShippingAddress;
  shipping: { methodId: ShippingMethodId; label: string; earliest: string; latest: string };
  card: SavedCard;
  lines: CartLine[];
  promoCode?: string;
  /** The account that placed it, when the shopper was signed in. */
  customerId?: string;
  totals: OrderTotalsSnapshot;
  /** Each status change, oldest first. */
  history?: OrderEvent[];
  /** Set when the order ships. */
  tracking?: { carrier: string; number: string };
  /** Money sent back for returns, oldest first. */
  refunds?: OrderRefund[];
}

export interface OrderRefund {
  returnId: string;
  amount: Cents;
  at: string;
}

export interface OrderEvent {
  status: OrderStatus;
  at: string;
  /** The staff member who made the change; absent for the shopper placing it. */
  by?: string;
  note?: string;
}

/** What the browser sends to place an order. The server recomputes every amount itself. */
export interface PlaceOrderRequest {
  /** Generated once per review visit; a repeated request with the same key returns the same order. */
  idempotencyKey: string;
  lines: CartLine[];
  promoCode?: string;
  methodId: ShippingMethodId;
  address: ShippingAddress;
  card: SavedCard;
  /** Links the order to the signed-in account; the server resolves it, never trusting a sent id. */
  sessionToken?: string;
}

/** Letters and digits that can't be misread for one another (no 0/O, 1/I/L). */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** "OR-" + the date as YYMMDD + four random characters. */
export function newOrderNumber(now: Date, random: () => number): string {
  const date = now.toISOString().slice(2, 10).replace(/-/g, '');
  let suffix = '';
  for (let i = 0; i < 4; i++) suffix += ALPHABET[Math.floor(random() * ALPHABET.length)];
  return `OR-${date}-${suffix}`;
}

export function itemCountOf(order: Pick<Order, 'lines'>): number {
  return order.lines.reduce((total, line) => total + line.quantity, 0);
}

const ORDER_DATE = new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' });

export function formatOrderDate(iso: string): string {
  return ORDER_DATE.format(new Date(iso));
}

export const STATUS_LABELS: Record<OrderStatus, string> = {
  placed: 'Order placed',
  packed: 'Packed',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};
