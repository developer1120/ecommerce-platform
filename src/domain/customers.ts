import { sumCents, type Cents } from './money';
import type { Order } from './order';
import type { ReturnRequest } from './returns';

/*
 * Customers, as the studio sees them: every account, plus anyone who
 * checked out as a guest, grouped by email. Spend is what they actually
 * kept: cancelled orders and refunds don't count.
 */

export interface CustomerAccount {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  role: 'customer' | 'admin';
}

export type CustomerKind = 'account' | 'guest';

export interface CustomerSummary {
  /** The account id, or "guest:" and the email for guest checkouts. */
  key: string;
  kind: CustomerKind;
  name: string;
  email: string;
  /** When the account was made, or the first guest order was placed. */
  since: string;
  orders: number;
  /** Paid for orders that weren't cancelled, less refunds. */
  spent: Cents;
  refunded: Cents;
  returns: number;
  lastOrderAt?: string;
  segments: CustomerSegment[];
}

export type CustomerSegment = 'vip' | 'repeat' | 'new' | 'lapsed' | 'no-orders';

export const SEGMENT_LABELS: Record<CustomerSegment, string> = {
  vip: 'Top spender',
  repeat: 'Repeat',
  new: 'New',
  lapsed: 'Lapsed',
  'no-orders': 'No orders',
};

export const VIP_SPEND: Cents = 50_000;
export const NEW_DAYS = 30;
export const LAPSED_DAYS = 120;
const DAY = 24 * 60 * 60 * 1000;

/** The admin page for a customer. Guest keys hold an email, so they are encoded. */
export const customerPath = (key: string) => `/admin/customers/${encodeURIComponent(key)}`;

export const guestKey = (email: string) => `guest:${email.trim().toLowerCase()}`;
const sameEmail = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Which groups a customer falls into, for badges and filters. A customer can be in several. */
export function segmentsFor(customer: Pick<CustomerSummary, 'orders' | 'spent' | 'since' | 'lastOrderAt'>, now: Date): CustomerSegment[] {
  if (customer.orders === 0) return ['no-orders'];
  const segments: CustomerSegment[] = [];
  if (customer.spent >= VIP_SPEND) segments.push('vip');
  if (customer.orders >= 2) segments.push('repeat');
  if (now.getTime() - new Date(customer.since).getTime() <= NEW_DAYS * DAY) segments.push('new');
  if (customer.lastOrderAt && now.getTime() - new Date(customer.lastOrderAt).getTime() > LAPSED_DAYS * DAY) segments.push('lapsed');
  return segments;
}

/** The account an order belongs to: its own, or one with the same email for a guest checkout. */
function ownerOf(order: Order, accounts: CustomerAccount[]): string {
  if (order.customerId) return order.customerId;
  const account = accounts.find((candidate) => sameEmail(candidate.email, order.email));
  return account ? account.id : guestKey(order.email);
}

/** Orders and returns grouped by customer key. */
export function groupByCustomer(accounts: CustomerAccount[], orders: Order[], returns: ReturnRequest[]) {
  const ordersByKey = new Map<string, Order[]>();
  const keyByOrder = new Map<string, string>();
  for (const order of orders) {
    const key = ownerOf(order, accounts);
    keyByOrder.set(order.id, key);
    ordersByKey.set(key, [...(ordersByKey.get(key) ?? []), order]);
  }
  const returnsByKey = new Map<string, ReturnRequest[]>();
  for (const request of returns) {
    const key = keyByOrder.get(request.orderId);
    if (key) returnsByKey.set(key, [...(returnsByKey.get(key) ?? []), request]);
  }
  return { ordersByKey, returnsByKey };
}

export function summarizeCustomer(
  key: string,
  base: { kind: CustomerKind; name: string; email: string; since?: string },
  orders: Order[],
