import {
  EMPTY_CONTACT,
  excerpt,
  fillReply,
  formatWait,
  hoursWaiting,
  isOverdue,
  nextTicketId,
  normalizeOrderNumber,
  recentTicketCount,
  sortTickets,
  validateContact,
  validateMessage,
  validateReply,
  type ContactForm,
} from './support';

const VALID: ContactForm = {
  ...EMPTY_CONTACT,
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  topic: 'order',
  subject: 'Change of address',
  message: 'Please send my order to my office instead.',
};

describe('validateContact', () => {
  it('accepts a complete message', () => {
    expect(validateContact(VALID)).toEqual({});
  });

  it('explains every missing field', () => {
    expect(validateContact(EMPTY_CONTACT)).toEqual({
      name: 'Enter your name',
      email: 'Enter your email address',
      topic: 'Choose what your message is about',
      subject: 'Add a subject',
      message: 'Write your message',
    });
  });

  it('checks the order number only when one is given', () => {
    expect(validateContact({ ...VALID, orderId: 'or261011k7f3' })).toEqual({});
    expect(validateContact({ ...VALID, orderId: '12345' })).toEqual({ orderId: 'Order numbers look like OR-261011-K7F3' });
  });

  it('asks for more than a word and less than an essay', () => {
    expect(validateMessage('Help')).toBe('Tell us a little more so we can help');
    expect(validateMessage('x'.repeat(2001))).toBe('Keep your message under 2000 characters');
    expect(validateContact({ ...VALID, subject: 'x'.repeat(121) }).subject).toBe('Keep the subject under 120 characters');
  });
});

describe('normalizeOrderNumber', () => {
  it('puts back the case and dashes shoppers leave out', () => {
    expect(normalizeOrderNumber(' or-261011-k7f3 ')).toBe('OR-261011-K7F3');
    expect(normalizeOrderNumber('OR 261011 K7F3')).toBe('OR-261011-K7F3');
    expect(normalizeOrderNumber('nonsense')).toBe('NONSENSE');
  });
});

describe('tickets', () => {
  it('numbers tickets after the highest so far', () => {
    expect(nextTicketId([])).toBe('HC-1001');
    expect(nextTicketId([{ id: 'HC-1001' }, { id: 'HC-1007' }, { id: 'HC-1003' }])).toBe('HC-1008');
  });

  it('counts an address’s tickets in the last hour', () => {
    const now = new Date('2026-10-07T19:00:00Z');
    const tickets = [
      { email: 'ada@example.com', createdAt: '2026-10-07T18:30:00Z' },
      { email: 'ada@example.com', createdAt: '2026-10-07T17:30:00Z' },
      { email: 'grace@example.com', createdAt: '2026-10-07T18:59:00Z' },
    ];
    expect(recentTicketCount(tickets, ' ADA@example.com', now)).toBe(1);
  });

  it('shortens long messages for previews', () => {
    expect(excerpt('Short\n\nmessage')).toBe('Short message');
    expect(excerpt('word '.repeat(40), 20)).toBe('word word word word…');
  });
});

describe('the studio side', () => {
  const at = (iso: string) => ({ id: iso, from: 'shopper' as const, author: 'Ada', body: 'Hi', at: iso });
  const now = new Date('2026-10-07T19:00:00Z');

  it('counts the wait from the shopper’s latest message, only while a reply is owed', () => {
    const ticket = { status: 'open' as const, messages: [at('2026-10-05T19:00:00Z'), at('2026-10-06T18:30:00Z')] };
    expect(hoursWaiting(ticket, now)).toBe(24);
    expect(isOverdue(ticket, now)).toBe(true);
    expect(hoursWaiting({ ...ticket, status: 'waiting' }, now)).toBeUndefined();
    expect([formatWait(0), formatWait(1), formatWait(47), formatWait(50)]).toEqual(['Under an hour', '1 hour', '47 hours', '2 days']);
  });

  it('sorts by who has waited longest, then by latest activity', () => {
    const open = (id: string, iso: string) => ({ id, status: 'open' as const, updatedAt: iso, messages: [at(iso)] });
    const done = (id: string, iso: string) => ({ id, status: 'closed' as const, updatedAt: iso, messages: [at(iso)] });
    const sorted = sortTickets(
      [done('a', '2026-10-07T10:00:00Z'), open('b', '2026-10-07T12:00:00Z'), open('c', '2026-10-06T12:00:00Z'), done('d', '2026-10-07T11:00:00Z')],
      now,
    );
    expect(sorted.map((ticket) => ticket.id)).toEqual(['c', 'b', 'd', 'a']);
  });

  it('fills saved replies with the shopper and order', () => {
    expect(fillReply('Hi {firstName}, order {orderId} is fixed.', { name: 'Ada Lovelace', orderId: 'OR-261007-AB12' })).toBe(
      'Hi Ada, order OR-261007-AB12 is fixed.',
    );
    expect(fillReply('Hi {firstName}, order {orderId} is fixed.', { name: ' ' })).toBe('Hi there, your order is fixed.');
  });

  it('accepts short replies but not empty or huge ones', () => {
    expect(validateReply('Thanks!')).toBeUndefined();
    expect(validateReply('  ')).toBe('Write a reply');
    expect(validateReply('x'.repeat(2001))).toBe('Keep your reply under 2000 characters');
  });
});
