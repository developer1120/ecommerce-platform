import { normalizeEmail, validateEmail, validateName } from './auth';

/*
 * Messages to the studio. The contact form opens a support ticket; the
 * studio and the shopper then write back and forth on it by email.
 */

export type SupportTopic = 'order' | 'return' | 'product' | 'wholesale' | 'other';

export const SUPPORT_TOPICS: { value: SupportTopic; label: string; hint: string }[] = [
  { value: 'order', label: 'An order', hint: 'Changes, delivery, a missing parcel' },
  { value: 'return', label: 'A return or refund', hint: 'Something to send back, or a refund to chase' },
  { value: 'product', label: 'A product', hint: 'Sizing, materials, care, availability' },
  { value: 'wholesale', label: 'Wholesale or press', hint: 'Stocking our makers, features, collaborations' },
  { value: 'other', label: 'Something else', hint: 'Anything we have not covered' },
];

export const isSupportTopic = (value: string): value is SupportTopic => SUPPORT_TOPICS.some((topic) => topic.value === value);
export const topicLabel = (topic: SupportTopic) => SUPPORT_TOPICS.find((option) => option.value === topic)!.label;

/** Topics where the order number helps the studio find things quickly. */
export const ORDER_TOPICS: SupportTopic[] = ['order', 'return'];

export const SUBJECT_MAX = 120;
export const MESSAGE_MIN = 10;
export const MESSAGE_MAX = 2000;

/** Like "OR-261011-K7F3"; shoppers often type it in lower case or without the dashes. */
const ORDER_NUMBER = /^OR-?\d{6}-?[A-Z0-9]{4}$/;

/** Upper case, with the dashes put back: "or261011k7f3" becomes "OR-261011-K7F3". */
export function normalizeOrderNumber(input: string): string {
  const compact = input.trim().toUpperCase().replace(/[\s-]/g, '');
  const match = /^OR(\d{6})([A-Z0-9]{4})$/.exec(compact);
  return match ? `OR-${match[1]}-${match[2]}` : input.trim().toUpperCase();
}

export interface ContactForm {
  name: string;
  email: string;
  topic: SupportTopic | '';
  orderId: string;
  subject: string;
  message: string;
}

export const EMPTY_CONTACT: ContactForm = { name: '', email: '', topic: '', orderId: '', subject: '', message: '' };

export type ContactErrors = Partial<Record<keyof ContactForm, string>>;

export function validateMessage(message: string): string | undefined {
  const text = message.trim();
  if (!text) return 'Write your message';
  if (text.length < MESSAGE_MIN) return 'Tell us a little more so we can help';
  if (text.length > MESSAGE_MAX) return `Keep your message under ${MESSAGE_MAX} characters`;
  return undefined;
}

export function validateContact(form: ContactForm): ContactErrors {
  const errors: ContactErrors = {};
  const name = validateName(form.name);
  if (name) errors.name = name;
  const email = validateEmail(form.email);
  if (email) errors.email = email;
  if (!form.topic) errors.topic = 'Choose what your message is about';
  if (form.orderId.trim() && !ORDER_NUMBER.test(normalizeOrderNumber(form.orderId))) {
    errors.orderId = 'Order numbers look like OR-261011-K7F3';
  }
  const subject = form.subject.trim();
  if (!subject) errors.subject = 'Add a subject';
  else if (subject.length > SUBJECT_MAX) errors.subject = `Keep the subject under ${SUBJECT_MAX} characters`;
  const message = validateMessage(form.message);
  if (message) errors.message = message;
  return errors;
}

export type TicketStatus = 'open' | 'waiting' | 'closed';

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  open: 'Waiting for the studio',
  waiting: 'Replied',
  closed: 'Closed',
};

export interface TicketMessage {
  id: string;
  from: 'shopper' | 'studio';
  /** The name shown on the message: the shopper's, or the studio member's. */
  author: string;
  body: string;
  at: string;
}

export interface SupportTicket {
  /** Also the reference in emails, e.g. "HC-1042". */
  id: string;
  topic: SupportTopic;
  subject: string;
  name: string;
  email: string;
  customerId?: string;
  orderId?: string;
  createdAt: string;
  /** When the last message was added, or the status last changed. */
  updatedAt: string;
  status: TicketStatus;
  messages: TicketMessage[];
}

const FIRST_TICKET_NUMBER = 1001;

/** The next free reference, one after the highest so far. */
export function nextTicketId(existing: Pick<SupportTicket, 'id'>[]): string {
  const highest = existing.reduce((max, ticket) => Math.max(max, Number(ticket.id.replace(/^HC-/, '')) || 0), FIRST_TICKET_NUMBER - 1);
  return `HC-${highest + 1}`;
}

/** At most this many tickets from one email address per hour, to keep the inbox free of floods. */
export const TICKETS_PER_HOUR = 3;
const HOUR_MS = 60 * 60 * 1000;

export function recentTicketCount(tickets: Pick<SupportTicket, 'email' | 'createdAt'>[], email: string, now: Date): number {
  const address = normalizeEmail(email);
  const since = now.getTime() - HOUR_MS;
  return tickets.filter((ticket) => ticket.email === address && new Date(ticket.createdAt).getTime() > since).length;
}

/** The latest message, for previews in lists. */
export function lastMessage(ticket: Pick<SupportTicket, 'messages'>): TicketMessage {
  return ticket.messages[ticket.messages.length - 1]!;
}

/** A one-line preview of a message body. */
export function excerpt(text: string, length = 120): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > length ? `${flat.slice(0, length - 1).trimEnd()}…` : flat;
}

/* The studio's side: queues, replies and how long people have waited. */

export const REPLY_MAX = MESSAGE_MAX;

export function validateReply(body: string): string | undefined {
  const text = body.trim();
  if (!text) return 'Write a reply';
  if (text.length > REPLY_MAX) return `Keep your reply under ${REPLY_MAX} characters`;
  return undefined;
}

/** How the studio sees each status: an open ticket is one it owes a reply. */
export const ADMIN_TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  open: 'Needs reply',
  waiting: 'Waiting on shopper',
  closed: 'Closed',
};

export type SupportQueue = TicketStatus | 'all';

export const SUPPORT_QUEUES: { value: SupportQueue; label: string }[] = [
  { value: 'open', label: 'Needs reply' },
  { value: 'waiting', label: 'Waiting on shopper' },
  { value: 'closed', label: 'Closed' },
  { value: 'all', label: 'All' },
];

export const isSupportQueue = (value: string | null): value is SupportQueue => SUPPORT_QUEUES.some((queue) => queue.value === value);

export function inSupportQueue(ticket: Pick<SupportTicket, 'status'>, queue: SupportQueue): boolean {
  return queue === 'all' || ticket.status === queue;
}

/** The studio promises a reply within a working day; past this a waiting ticket is flagged. */
export const REPLY_DUE_HOURS = 24;

/** Whole hours since the shopper's last message on a ticket that needs a reply; undefined otherwise. */
export function hoursWaiting(ticket: Pick<SupportTicket, 'status' | 'messages'>, now: Date): number | undefined {
  if (ticket.status !== 'open') return undefined;
  const last = [...ticket.messages].reverse().find((message) => message.from === 'shopper');
  if (!last) return undefined;
  return Math.max(0, Math.floor((now.getTime() - new Date(last.at).getTime()) / (60 * 60 * 1000)));
}

export function isOverdue(ticket: Pick<SupportTicket, 'status' | 'messages'>, now: Date): boolean {
  return (hoursWaiting(ticket, now) ?? 0) >= REPLY_DUE_HOURS;
}

/** "Under an hour", "5 hours", "2 days". */
export function formatWait(hours: number): string {
  if (hours < 1) return 'Under an hour';
  if (hours < 48) return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  return `${Math.floor(hours / 24)} days`;
}

/** Tickets that need a reply first, oldest wait first; then the rest, most recently active first. */
export function sortTickets<T extends Pick<SupportTicket, 'status' | 'updatedAt' | 'messages'>>(tickets: T[], now: Date): T[] {
  return [...tickets].sort((a, b) => {
    const waitA = hoursWaiting(a, now);
    const waitB = hoursWaiting(b, now);
    if (waitA !== undefined && waitB !== undefined) return waitB - waitA || a.updatedAt.localeCompare(b.updatedAt);
    if (waitA !== undefined) return -1;
    if (waitB !== undefined) return 1;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

export interface SavedReply {
  id: string;
  label: string;
  /** May use {firstName} and {orderId}; see fillReply. */
  body: string;
}

/** Answers the studio sends often, ready to adjust before sending. */
export const SAVED_REPLIES: SavedReply[] = [
  {
    id: 'thanks',
    label: 'Thanks, looking into it',
    body: "Hi {firstName},\n\nThanks for getting in touch. I'm looking into this now and will come back to you by the end of tomorrow at the latest.",
  },
  {
    id: 'address-change',
    label: 'Address changed',
    body: "Hi {firstName},\n\nNo problem at all. I've updated the delivery address on order {orderId}, and it will go out to the new address.",
  },
  {
    id: 'late-parcel',
    label: 'Chasing a late parcel',
    body: "Hi {firstName},\n\nSorry your parcel is taking longer than it should. I've opened a trace with the carrier for order {orderId}. If it hasn't moved in two working days, we'll send a replacement.",
  },
  {
    id: 'start-return',
    label: 'How to start a return',
    body: 'Hi {firstName},\n\nYou can start a return from Your account → Orders: open the order and choose "Start a return". If you checked out as a guest, reply here with the items and the reason and I\'ll set it up for you.',
  },
  {
    id: 'closing',
    label: 'Glad to help, closing',
    body: "Hi {firstName},\n\nGlad that's sorted. I'll close this conversation, but just reply if anything else comes up.",
  },
];

/** A saved reply with the shopper's details filled in. Without an order, the order clause reads "your order". */
export function fillReply(template: string, ticket: Pick<SupportTicket, 'name' | 'orderId'>): string {
  const firstName = ticket.name.trim().split(/\s+/)[0] || 'there';
  return template
    .replaceAll('{firstName}', firstName)
    .replaceAll('order {orderId}', ticket.orderId ? `order ${ticket.orderId}` : 'your order')
    .replaceAll('{orderId}', ticket.orderId ?? 'your order');
}
