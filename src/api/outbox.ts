import { readJson, writeJson } from '@/lib/storage';

/*
 * The pretend mail server. Nothing is really sent; emails are kept here so
 * the app and its tests can see what a shopper would have received.
 */

export const OUTBOX_KEY = 'tanelt:mock-db:outbox';

export interface OutboxEmail {
  to: string;
  subject: string;
  body: string;
  sentAt: string;
}

const isArray = (value: unknown): value is unknown[] => Array.isArray(value);

export function loadOutbox(): OutboxEmail[] {
  return readJson(OUTBOX_KEY, [], isArray) as OutboxEmail[];
}

export function sendEmails(emails: OutboxEmail[]): void {
  if (emails.length > 0) writeJson(OUTBOX_KEY, [...loadOutbox(), ...emails]);
}
