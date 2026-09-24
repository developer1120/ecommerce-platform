import { normalizeEmail, validateEmail } from '@/domain/auth';
import { randomHex } from '@/lib/crypto';
import { readJson, writeJson } from '@/lib/storage';
import { userForToken } from './authApi';
import { ApiError, simulateRequest, type RequestOptions } from './client';
import { findVariant } from './mockDb';
import { sendEmails } from './outbox';

/*
 * Back-in-stock alerts. Shoppers ask to hear about a sold-out option;
 * restocking it sends each waiting shopper an email (into a pretend outbox)
 * and marks their alert as sent.
 */

export const ALERTS_KEY = 'tanelt:mock-db:stock-alerts';
export { loadOutbox, OUTBOX_KEY, type OutboxEmail } from './outbox';

export interface StockAlert {
  id: string;
  productId: string;
  variantId: string;
  email: string;
  userId?: string;
  createdAt: string;
  status: 'waiting' | 'sent' | 'cancelled';
  sentAt?: string;
}

const isArray = (value: unknown): value is unknown[] => Array.isArray(value);
const alerts = (): StockAlert[] => readJson(ALERTS_KEY, [], isArray) as StockAlert[];
const saveAlerts = (list: StockAlert[]) => writeJson(ALERTS_KEY, list);

export interface SubscribeResult {
  alert: StockAlert;
  /** True when this email was already waiting for this option. */
  alreadySubscribed: boolean;
}

export function subscribeToRestock(
  variantId: string,
  emailInput: string,
  token?: string | null,
  options?: RequestOptions,
): Promise<SubscribeResult> {
  return simulateRequest(() => {
    const problem = validateEmail(emailInput);
    if (problem) throw new ApiError('VALIDATION', problem);
    const found = findVariant(variantId);
    if (!found) throw new ApiError('NOT_FOUND', "We couldn't find that option.");
    if (found.variant.stock > 0) throw new ApiError('VALIDATION', "Good news: that option is in stock now.");

    const email = normalizeEmail(emailInput);
    const existing = alerts().find((alert) => alert.variantId === variantId && alert.email === email && alert.status === 'waiting');
    if (existing) return { alert: existing, alreadySubscribed: true };

    const userId = userForToken(token)?.id;
    const alert: StockAlert = {
      id: `alert_${randomHex(6)}`,
      productId: found.product.id,
      variantId,
      email,
      ...(userId && { userId }),
      createdAt: new Date().toISOString(),
      status: 'waiting',
    };
    saveAlerts([...alerts(), alert]);
    return { alert, alreadySubscribed: false };
  }, options);
}

/** The signed-in shopper's waiting alerts, by account or by email. */
export function listMyAlerts(token: string, options?: RequestOptions): Promise<StockAlert[]> {
  return simulateRequest(() => {
    const user = userForToken(token);
    if (!user) throw new ApiError('UNAUTHORIZED', 'Your session has ended. Sign in again.');
    return alerts()
      .filter((alert) => alert.status === 'waiting' && (alert.userId === user.id || alert.email === user.email))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, options);
}

export function cancelAlert(token: string, alertId: string, options?: RequestOptions): Promise<void> {
  return simulateRequest(() => {
    const user = userForToken(token);
    if (!user) throw new ApiError('UNAUTHORIZED', 'Your session has ended. Sign in again.');
    const list = alerts();
    const index = list.findIndex(
      (alert) => alert.id === alertId && (alert.userId === user.id || alert.email === user.email),
    );
    if (index < 0) throw new ApiError('NOT_FOUND', "We couldn't find that alert.");
    list[index] = { ...list[index]!, status: 'cancelled' };
    saveAlerts(list);
  }, options);
}

function describeVariant(productName: string, options: Record<string, string>): string {
  const chosen = Object.values(options).join(' / ');
  return chosen ? `${productName} (${chosen})` : productName;
}

/**
 * Adds stock to a variant and emails everyone waiting for it. Used by the
 * admin tools; synchronous because it acts directly on the mock server.
 */
export function restockVariant(variantId: string, quantity: number): { stock: number; notified: number } {
  const found = findVariant(variantId);
  if (!found) throw new ApiError('NOT_FOUND', "We couldn't find that option.");
  if (!Number.isInteger(quantity) || quantity <= 0) throw new ApiError('VALIDATION', 'Add at least one unit.');
  found.variant.stock += quantity;

  const now = new Date().toISOString();
  const label = describeVariant(found.product.name, found.variant.options);
  const list = alerts();
  const waiting = list.filter((alert) => alert.variantId === variantId && alert.status === 'waiting');
  for (const alert of waiting) {
    alert.status = 'sent';
    alert.sentAt = now;
  }
  saveAlerts(list);
  sendEmails(
    waiting.map((alert) => ({
      to: alert.email,
      subject: `Back in stock: ${label}`,
      body: `Good news. ${label} is back in stock at Tanelt. Small batches go quickly: /product/${found.product.slug}?variant=${variantId}`,
      sentAt: now,
    })),
  );
  return { stock: found.variant.stock, notified: waiting.length };
}
