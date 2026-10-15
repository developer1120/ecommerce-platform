import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getSupportTicket, listSupportTickets, replyToTicket, setTicketStatus } from '@/api/adminSupportApi';
import { signIn, signUp } from '@/api/authApi';
import { loadOutbox } from '@/api/outbox';
import { closeMyTicket, getMyTicket, listMyTickets, loadTickets, replyAsShopper, submitContact } from '@/api/supportApi';
import { DEMO_ADMIN } from '@/data/demoAccounts';
import { EMPTY_CONTACT, type ContactForm } from '@/domain/support';
import { SESSION_TOKEN_KEY } from '@/state/AuthProvider';
import { renderRoute } from '@/test/renderRoute';

const HOUR = 60 * 60 * 1000;
const main = () => within(screen.getByRole('main'));

const message = (overrides: Partial<ContactForm> = {}): ContactForm => ({
  ...EMPTY_CONTACT,
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  topic: 'product',
  subject: 'Mug glaze',
  message: 'Is the moss glaze darker in person?',
  ...overrides,
});

async function admin() {
  const { token } = await signIn({ email: DEMO_ADMIN.email, password: DEMO_ADMIN.password, remember: true });
  return token;
}

async function ada() {
  const { token } = await signUp({ name: 'Ada Lovelace', email: 'ada@example.com', password: 'slow mornings with tea', remember: true });
  return token;
}

describe('conversations on the server', () => {
  it('shows shoppers their own tickets, including ones sent before signing up', async () => {
    const before = await submitContact(null, message());
    await submitContact(null, message({ name: 'Grace', email: 'grace@example.com' }));
    const token = await ada();
    expect((await listMyTickets(token)).map((ticket) => ticket.id)).toEqual([before.id]);
    await expect(getMyTicket(token, 'HC-1002')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(listMyTickets('nope')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('passes the conversation back and forth, emailing each studio reply', async () => {
    const shopper = await ada();
    const studio = await admin();
    const ticket = await submitContact(shopper, message());
    vi.advanceTimersByTime(HOUR);

    const replied = await replyToTicket(studio, ticket.id, { body: '  Slightly, yes.  ', seen: 1 });
    expect(replied).toMatchObject({ status: 'waiting', messages: [{ from: 'shopper' }, { from: 'studio', author: 'Studio Admin', body: 'Slightly, yes.' }] });
    expect(loadOutbox().at(-1)).toEqual({ to: 'ada@example.com', subject: `Re: Mug glaze [${ticket.id}]`, body: 'Slightly, yes.', sentAt: replied.updatedAt });

    const back = await replyAsShopper(shopper, ticket.id, 'Thanks! Ordering now.');
    expect(back.status).toBe('open');
    // The admin was looking at two messages; the shopper's third makes the reply stale.
    await expect(replyToTicket(studio, ticket.id, { body: 'Great', seen: 2 })).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(replyToTicket(studio, ticket.id, { body: '   ', seen: 3 })).rejects.toMatchObject({ code: 'VALIDATION', message: 'Write a reply' });

    expect((await replyToTicket(studio, ticket.id, { body: 'Enjoy!', close: true, seen: 3 })).status).toBe('closed');
    // Writing again reopens it.
    expect((await replyAsShopper(shopper, ticket.id, 'One more thing...')).status).toBe('open');
    expect((await closeMyTicket(shopper, ticket.id)).status).toBe('closed');
    await expect(closeMyTicket(shopper, ticket.id)).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('lets only admins see and change the inbox', async () => {
    const shopper = await ada();
    const ticket = await submitContact(null, message());
    await expect(listSupportTickets(shopper)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(replyToTicket(shopper, ticket.id, { body: 'Hi', seen: 1 })).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const studio = await admin();
    await expect(setTicketStatus(studio, ticket.id, { to: 'open', seen: 1 })).rejects.toMatchObject({ code: 'CONFLICT' });
    expect((await setTicketStatus(studio, ticket.id, { to: 'closed', seen: 1 })).status).toBe('closed');
    expect((await setTicketStatus(studio, ticket.id, { to: 'open', seen: 1 })).status).toBe('open');
    expect(loadOutbox()).toHaveLength(1);
  });

  it('gathers the sender’s other conversations and orders', async () => {
    const first = await submitContact(null, message());
    vi.advanceTimersByTime(HOUR);
    const second = await submitContact(null, message({ subject: 'Napkins' }));
    const details = await getSupportTicket(await admin(), second.id);
    expect(details.others.map((other) => other.id)).toEqual([first.id]);
    expect(details.orderCount).toBe(0);
  });
});

describe('the shopper’s messages', () => {
  beforeEach(async () => {
    localStorage.setItem(SESSION_TOKEN_KEY, JSON.stringify(await ada()));
  });

  it('starts empty, with a way to write in', async () => {
    renderRoute('/account/messages');
    expect(await main().findByText(/No messages yet/)).toBeInTheDocument();
    expect(main().getByRole('link', { name: 'New message' })).toHaveAttribute('href', '/help/contact');
    expect(within(screen.getByRole('navigation', { name: 'Account' })).getByRole('link', { name: 'Messages' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
