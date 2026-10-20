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
  returns: ReturnRequest[],
  now: Date,
): CustomerSummary {
  const kept = orders.filter((order) => order.status !== 'cancelled');
  const refunded = sumCents(kept.flatMap((order) => (order.refunds ?? []).map((refund) => refund.amount)));
  const placed = orders.map((order) => order.placedAt).sort();
  const summary = {
    key,
    kind: base.kind,
    name: base.name,
    email: base.email,
    since: base.since ?? placed[0] ?? now.toISOString(),
    orders: orders.length,
    spent: sumCents(kept.map((order) => order.totals.total)) - refunded,
    refunded,
    returns: returns.length,
    ...(placed.length > 0 && { lastOrderAt: placed.at(-1)! }),
  };
  return { ...summary, segments: segmentsFor(summary, now) };
}

/** Every shopper: accounts (not staff) and guests, with their orders and returns. */
export function summarizeCustomers(accounts: CustomerAccount[], orders: Order[], returns: ReturnRequest[], now: Date): CustomerSummary[] {
  const shoppers = accounts.filter((account) => account.role !== 'admin');
  const { ordersByKey, returnsByKey } = groupByCustomer(shoppers, orders, returns);
  const list = shoppers.map((account) =>
    summarizeCustomer(
      account.id,
      { kind: 'account', name: account.name, email: account.email, since: account.createdAt },
      ordersByKey.get(account.id) ?? [],
      returnsByKey.get(account.id) ?? [],
      now,
    ),
  );
  for (const [key, guestOrders] of ordersByKey) {
    if (!key.startsWith('guest:')) continue;
    // The name on their most recent order.
    const latest = guestOrders.reduce((a, b) => (a.placedAt > b.placedAt ? a : b));
    const name = `${latest.address.firstName} ${latest.address.lastName}`.trim() || latest.email;
    list.push(summarizeCustomer(key, { kind: 'guest', name, email: latest.email }, guestOrders, returnsByKey.get(key) ?? [], now));
  }
  return list;
}

export type CustomerSort = 'recent' | 'spent' | 'orders' | 'name';

export const CUSTOMER_SORTS: { value: CustomerSort; label: string }[] = [
  { value: 'recent', label: 'Most recent order' },
  { value: 'spent', label: 'Highest spend' },
  { value: 'orders', label: 'Most orders' },
  { value: 'name', label: 'Name' },
];

export function sortCustomers(list: CustomerSummary[], sort: CustomerSort): CustomerSummary[] {
  const byName = (a: CustomerSummary, b: CustomerSummary) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });
  const sorted = [...list];
  switch (sort) {
    case 'recent':
      // Customers who never ordered go last, newest accounts first among them.
      return sorted.sort((a, b) => (b.lastOrderAt ?? '').localeCompare(a.lastOrderAt ?? '') || b.since.localeCompare(a.since));
    case 'spent':
      return sorted.sort((a, b) => b.spent - a.spent || byName(a, b));
    case 'orders':
      return sorted.sort((a, b) => b.orders - a.orders || byName(a, b));
    case 'name':
      return sorted.sort(byName);
  }
}

/**
 * A spreadsheet cell. Quotes when needed, and defuses values a spreadsheet
 * would run as a formula (a name like "=HYPERLINK(...)").
 */
export function csvCell(value: string | number): string {
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Customers as CSV, amounts in dollars, for the studio's own spreadsheets. */
export function customersToCsv(list: CustomerSummary[]): string {
  const header = ['Name', 'Email', 'Type', 'Customer since', 'Orders', 'Spent', 'Refunded', 'Returns', 'Last order', 'Segments'];
  const rows = list.map((customer) => [
    customer.name,
    customer.email,
    customer.kind === 'account' ? 'Account' : 'Guest',
    customer.since.slice(0, 10),
    customer.orders,
    (customer.spent / 100).toFixed(2),
    (customer.refunded / 100).toFixed(2),
    customer.returns,
    customer.lastOrderAt?.slice(0, 10) ?? '',
    customer.segments.map((segment) => SEGMENT_LABELS[segment]).join('; '),
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}

export const CUSTOMER_NOTE_MAX = 1000;
