import type { Order } from '@/domain/order';
import { validateReply, type SupportTicket, type TicketStatus } from '@/domain/support';
import { requireAdmin } from './authApi';
import { ApiError, simulateRequest, type RequestOptions } from './client';
import { findOrder, loadOrders } from './mockDb';
import { sendEmails } from './outbox';
import { loadTickets, messageId, saveTickets } from './supportApi';

/** Every ticket in the shop. Admins only. Sorting is left to the page, which knows the queue. */
export function listSupportTickets(token: string, options?: RequestOptions): Promise<SupportTicket[]> {
  return simulateRequest(() => {
    requireAdmin(token);
    return loadTickets();
  }, options);
}

export interface AdminTicket {
  ticket: SupportTicket;
  /** The linked order, if any and still on file. */
  order?: Order;
  /** How many orders the sender has placed, by account or email. */
  orderCount: number;
  /** Other conversations with the same person, newest first. */
  others: Pick<SupportTicket, 'id' | 'subject' | 'status' | 'updatedAt'>[];
}

const NOT_FOUND = "We couldn't find that conversation.";

export function getSupportTicket(token: string, ticketId: string, options?: RequestOptions): Promise<AdminTicket> {
  return simulateRequest(() => {
    requireAdmin(token);
    const tickets = loadTickets();
    const ticket = tickets.find((candidate) => candidate.id === ticketId);
    if (!ticket) throw new ApiError('NOT_FOUND', NOT_FOUND);
    const orderCount = loadOrders().filter(
      (order) => order.email === ticket.email || (ticket.customerId !== undefined && order.customerId === ticket.customerId),
    ).length;
    const others = tickets
      .filter((other) => other.id !== ticket.id && other.email === ticket.email)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(({ id, subject, status, updatedAt }) => ({ id, subject, status, updatedAt }));
    return { ticket, order: ticket.orderId ? findOrder(ticket.orderId) : undefined, orderCount, others };
  }, options);
}

export interface StudioReply {
  body: string;
  /** Close the conversation once the reply is sent. */
  close?: boolean;
  /**
   * How many messages the admin could see. If the shopper has written
   * since, the reply is refused, so nobody answers a message they haven't read.
   */
  seen: number;
}

/** Finds a ticket for an update, refusing if it has moved on since the admin last looked. */
function ticketForUpdate(tickets: SupportTicket[], ticketId: string, seen: number): number {
  const index = tickets.findIndex((candidate) => candidate.id === ticketId);
  if (index < 0) throw new ApiError('NOT_FOUND', NOT_FOUND);
  if (tickets[index]!.messages.length !== seen) {
    throw new ApiError('CONFLICT', 'The shopper has written again since you opened this conversation.');
  }
  return index;
}

/** Sends the studio's reply by email and records it on the ticket. */
export function replyToTicket(token: string, ticketId: string, reply: StudioReply, options?: RequestOptions): Promise<SupportTicket> {
  return simulateRequest(() => {
    const admin = requireAdmin(token);
    const problem = validateReply(reply.body);
    if (problem) throw new ApiError('VALIDATION', problem);
    const tickets = loadTickets();
    const index = ticketForUpdate(tickets, ticketId, reply.seen);
    const ticket = tickets[index]!;
    const at = new Date().toISOString();
    const body = reply.body.trim();
    const updated: SupportTicket = {
      ...ticket,
      status: reply.close ? 'closed' : 'waiting',
      updatedAt: at,
      messages: [...ticket.messages, { id: messageId(), from: 'studio', author: admin.name, body, at }],
    };
    tickets[index] = updated;
    saveTickets(tickets);
    sendEmails([{ to: ticket.email, subject: `Re: ${ticket.subject} [${ticket.id}]`, body, sentAt: at }]);
    return updated;
  }, options);
}

/** Closes or reopens a conversation without writing to the shopper. */
export function setTicketStatus(
  token: string,
  ticketId: string,
  change: { to: Extract<TicketStatus, 'open' | 'closed'>; seen: number },
  options?: RequestOptions,
): Promise<SupportTicket> {
  return simulateRequest(() => {
    requireAdmin(token);
    const tickets = loadTickets();
    const index = ticketForUpdate(tickets, ticketId, change.seen);
    const ticket = tickets[index]!;
    if (change.to === 'closed' && ticket.status === 'closed') throw new ApiError('CONFLICT', 'This conversation is already closed.');
    if (change.to === 'open' && ticket.status !== 'closed') throw new ApiError('CONFLICT', 'This conversation is already open.');
    const updated: SupportTicket = { ...ticket, status: change.to, updatedAt: new Date().toISOString() };
    tickets[index] = updated;
    saveTickets(tickets);
    return updated;
  }, options);
}
