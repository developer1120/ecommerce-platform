import { CUSTOMER_NOTE_MAX, groupByCustomer, summarizeCustomers, type CustomerSummary } from '@/domain/customers';
import type { Order } from '@/domain/order';
import type { ReturnRequest } from '@/domain/returns';
import { readJson, writeJson } from '@/lib/storage';
import { listUsers, requireAdmin } from './authApi';
import { ApiError, simulateRequest, type RequestOptions } from './client';
import { loadOrders } from './mockDb';
import { loadReturns } from './returnsApi';

export const CUSTOMER_NOTES_KEY = 'tanelt:mock-db:customer-notes';

/** A private note the studio keeps about a customer. Shoppers never see it. */
export interface CustomerNote {
  text: string;
  by: string;
  at: string;
}

const isRecord = (value: unknown): value is Record<string, CustomerNote> => typeof value === 'object' && value !== null && !Array.isArray(value);
const notes = () => readJson<Record<string, CustomerNote>>(CUSTOMER_NOTES_KEY, {}, isRecord);

/** Every shopper with an account or a guest order. Admins only. */
export function listCustomers(token: string, options?: RequestOptions): Promise<CustomerSummary[]> {
  return simulateRequest(() => {
    requireAdmin(token);
    return summarizeCustomers(listUsers(), loadOrders(), loadReturns(), new Date());
  }, options);
}

export interface CustomerDetail {
  customer: CustomerSummary;
  /** Newest first. */
  orders: Order[];
  /** Newest first. */
  returns: ReturnRequest[];
  note?: CustomerNote;
}

export function getCustomer(token: string, key: string, options?: RequestOptions): Promise<CustomerDetail> {
  return simulateRequest(() => {
    requireAdmin(token);
    const users = listUsers();
    const orders = loadOrders();
    const returns = loadReturns();
    const customer = summarizeCustomers(users, orders, returns, new Date()).find((candidate) => candidate.key === key);
    if (!customer) throw new ApiError('NOT_FOUND', "We couldn't find that customer.");
    const { ordersByKey, returnsByKey } = groupByCustomer(
      users.filter((user) => user.role !== 'admin'),
      orders,
      returns,
    );
    const note = notes()[key];
    return {
      customer,
      orders: (ordersByKey.get(key) ?? []).sort((a, b) => b.placedAt.localeCompare(a.placedAt)),
      returns: (returnsByKey.get(key) ?? []).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      ...(note && { note }),
    };
  }, options);
}

/** Saves the studio's note on a customer; an empty note removes it. */
export function saveCustomerNote(token: string, key: string, text: string, options?: RequestOptions): Promise<CustomerNote | null> {
  return simulateRequest(() => {
    const admin = requireAdmin(token);
    const known = summarizeCustomers(listUsers(), loadOrders(), loadReturns(), new Date()).some((customer) => customer.key === key);
    if (!known) throw new ApiError('NOT_FOUND', "We couldn't find that customer.");
    const trimmed = text.trim();
    if (trimmed.length > CUSTOMER_NOTE_MAX) throw new ApiError('VALIDATION', `Keep the note under ${CUSTOMER_NOTE_MAX} characters.`);
    const all = notes();
    if (!trimmed) {
      delete all[key];
      writeJson(CUSTOMER_NOTES_KEY, all);
      return null;
    }
    const note: CustomerNote = { text: trimmed, by: admin.name, at: new Date().toISOString() };
    writeJson(CUSTOMER_NOTES_KEY, { ...all, [key]: note });
    return note;
  }, options);
}
