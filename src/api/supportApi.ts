import { normalizeEmail } from '@/domain/auth';
import {
  isSupportTopic,
  nextTicketId,
  normalizeOrderNumber,
  recentTicketCount,
  TICKETS_PER_HOUR,
  topicLabel,
  validateContact,
  validateReply,
  type ContactForm,
  type SupportTicket,
} from '@/domain/support';
import { randomHex } from '@/lib/crypto';
import { readJson, writeJson } from '@/lib/storage';
import { userForToken, type User } from './authApi';
import { ApiError, simulateRequest, type RequestOptions } from './client';
import { findOrder } from './mockDb';
import { sendEmails } from './outbox';

export const TICKETS_KEY = 'tanelt:mock-db:support-tickets';

const isArray = (value: unknown): value is unknown[] => Array.isArray(value);
/** Every ticket, in the order they were opened. */
export const loadTickets = (): SupportTicket[] => readJson(TICKETS_KEY, [], isArray) as SupportTicket[];
export const saveTickets = (tickets: SupportTicket[]) => writeJson(TICKETS_KEY, tickets);

export const messageId = () => `msg_${randomHex(6)}`;

/** The studio's reply-by promise, repeated in emails and on the confirmation. */
export const REPLY_WITHIN = 'one working day';

/**
 * Opens a ticket from the contact form. Signed-in shoppers have it linked
 * to their account, so it also appears under Your account. An order number
 * is only linked if it matches an order placed with the same email.
 */
export function submitContact(token: string | null, form: ContactForm, options?: RequestOptions): Promise<SupportTicket> {
  return simulateRequest(() => {
    const errors = validateContact(form);
    const problem = Object.values(errors)[0];
    if (problem || !isSupportTopic(form.topic)) throw new ApiError('VALIDATION', problem ?? 'Choose what your message is about');

    const user = userForToken(token);
    const email = normalizeEmail(form.email);
    const now = new Date();
    const tickets = loadTickets();
    if (recentTicketCount(tickets, email, now) >= TICKETS_PER_HOUR) {
      throw new ApiError('RATE_LIMITED', "You've sent us several messages in the last hour. We'll reply to those first.");
    }

    const orderNumber = form.orderId.trim() ? normalizeOrderNumber(form.orderId) : '';
    const order = orderNumber ? findOrder(orderNumber) : undefined;
    // An order number that doesn't match is kept in the message for the studio, but not linked.
    const linked = order && (order.email === email || (user && order.customerId === user.id)) ? order.id : undefined;
    const name = form.name.trim();
    const at = now.toISOString();
    const body = form.message.trim();
    const ticket: SupportTicket = {
      id: nextTicketId(tickets),
      topic: form.topic,
      subject: form.subject.trim(),
      name,
      email,
      ...(user && { customerId: user.id }),
      ...(linked && { orderId: linked }),
      createdAt: at,
      updatedAt: at,
      status: 'open',
      messages: [
        {
          id: messageId(),
          from: 'shopper',
          author: name,
          body: orderNumber && !linked ? `${body}\n\n(Order number given: ${orderNumber})` : body,
          at,
        },
      ],
    };
    saveTickets([...tickets, ticket]);
    sendEmails([
      {
        to: email,
        subject: `We've got your message [${ticket.id}]`,
        body: `Hi ${name.split(' ')[0]}, thanks for getting in touch about ${topicLabel(ticket.topic).toLowerCase()}. We reply within ${REPLY_WITHIN}. Your reference is ${ticket.id}; reply to this email to add anything.`,
        sentAt: at,
      },
    ]);
    return ticket;
  }, options);
}

/** Tickets belong to an account, and to its email: messages sent before signing up show too. */
const isMine = (ticket: SupportTicket, user: User) => ticket.customerId === user.id || ticket.email === normalizeEmail(user.email);

function signedIn(token: string): User {
  const user = userForToken(token);
  if (!user) throw new ApiError('UNAUTHORIZED', 'Your session has ended. Sign in again.');
  return user;
}

const TICKET_NOT_FOUND = "We couldn't find that conversation.";

/** The signed-in shopper's conversations with the studio, most recently active first. */
export function listMyTickets(token: string, options?: RequestOptions): Promise<SupportTicket[]> {
  return simulateRequest(() => {
    const user = signedIn(token);
    return loadTickets()
      .filter((ticket) => isMine(ticket, user))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, options);
}

export function getMyTicket(token: string, ticketId: string, options?: RequestOptions): Promise<SupportTicket> {
  return simulateRequest(() => {
    const user = signedIn(token);
    const ticket = loadTickets().find((candidate) => candidate.id === ticketId);
    if (!ticket || !isMine(ticket, user)) throw new ApiError('NOT_FOUND', TICKET_NOT_FOUND);
    return ticket;
  }, options);
}

/** Changes one of the shopper's tickets and saves it. */
function updateMine(token: string, ticketId: string, change: (ticket: SupportTicket, user: User, at: string) => SupportTicket): SupportTicket {
  const user = signedIn(token);
  const tickets = loadTickets();
  const index = tickets.findIndex((candidate) => candidate.id === ticketId && isMine(candidate, user));
  if (index < 0) throw new ApiError('NOT_FOUND', TICKET_NOT_FOUND);
  const updated = change(tickets[index]!, user, new Date().toISOString());
  tickets[index] = updated;
  saveTickets(tickets);
  return updated;
}

/** Adds the shopper's reply. The ticket goes back to the studio, reopening it if it was closed. */
export function replyAsShopper(token: string, ticketId: string, body: string, options?: RequestOptions): Promise<SupportTicket> {
  return simulateRequest(() => {
    const problem = validateReply(body);
    if (problem) throw new ApiError('VALIDATION', problem);
    return updateMine(token, ticketId, (ticket, user, at) => ({
      ...ticket,
      status: 'open',
      updatedAt: at,
      messages: [...ticket.messages, { id: messageId(), from: 'shopper', author: user.name, body: body.trim(), at }],
    }));
  }, options);
}

/** The shopper says they're sorted. */
export function closeMyTicket(token: string, ticketId: string, options?: RequestOptions): Promise<SupportTicket> {
  return simulateRequest(
    () =>
      updateMine(token, ticketId, (ticket, _user, at) => {
        if (ticket.status === 'closed') throw new ApiError('CONFLICT', 'This conversation is already closed.');
        return { ...ticket, status: 'closed', updatedAt: at };
      }),
    options,
  );
}
