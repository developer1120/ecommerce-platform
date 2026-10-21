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
