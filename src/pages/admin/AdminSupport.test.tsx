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

  it('opens a conversation from the contact form and keeps it going', async () => {
    const user = userEvent.setup();
    renderRoute('/help/contact?topic=product');
    await user.type(await main().findByLabelText('Subject'), 'Mug glaze');
    await user.type(main().getByLabelText('Message'), 'Is the moss glaze darker in person?');
    await user.click(main().getByRole('button', { name: 'Send message' }));
    await user.click(await main().findByRole('link', { name: 'See the conversation' }));

    expect(await main().findByRole('heading', { level: 2, name: 'Mug glaze' })).toBeInTheDocument();
    expect(main().getByText('Waiting for the studio')).toBeInTheDocument();
    const thread = main().getByRole('list', { name: 'Conversation' });
    expect(within(thread).getAllByRole('article')).toHaveLength(1);

    await user.click(main().getByRole('button', { name: 'Send reply' }));
    expect(main().getByText('Write a reply')).toBeInTheDocument();
    await user.type(main().getByLabelText('Your reply'), 'Also, do you ship to Hawaii?');
    await user.click(main().getByRole('button', { name: 'Send reply' }));
    await waitFor(() => expect(within(thread).getAllByRole('article')).toHaveLength(2));
    expect(main().getByLabelText('Your reply')).toHaveValue('');

    await user.click(main().getByRole('button', { name: 'Mark as resolved' }));
    expect(await screen.findByText('Marked as resolved')).toBeInTheDocument();
    expect(main().getByText('This conversation is closed. Replying opens it again.')).toBeInTheDocument();
    expect(loadTickets()[0]).toMatchObject({ status: 'closed' });
  });

  it('lists conversations with the latest word', async () => {
    const token = JSON.parse(localStorage.getItem(SESSION_TOKEN_KEY)!) as string;
    const ticket = await submitContact(token, message());
    await replyToTicket(await admin(), ticket.id, { body: 'It is a touch darker, yes.', seen: 1 });
    renderRoute('/account/messages');
    const card = await main().findByRole('link', { name: `Mug glaze, ${ticket.id}` });
    expect(card).toHaveTextContent('Replied');
    expect(card).toHaveTextContent('Studio: It is a touch darker, yes.');
    expect(card).toHaveTextContent('2 messages');
  });
});

describe('the support inbox', () => {
  beforeEach(async () => {
    localStorage.setItem(SESSION_TOKEN_KEY, JSON.stringify(await admin()));
  });

  it('puts the longest wait first and flags overdue replies', async () => {
    const old = await submitContact(null, message({ subject: 'Old question' }));
    vi.advanceTimersByTime(30 * HOUR);
    await submitContact(null, message({ name: 'Grace Hopper', email: 'grace@example.com', subject: 'New question' }));
    const answered = await submitContact(null, message({ name: 'Ken', email: 'ken@example.com', subject: 'Answered' }));
    await replyToTicket(JSON.parse(localStorage.getItem(SESSION_TOKEN_KEY)!) as string, answered.id, { body: 'Done', seen: 1 });

    const user = userEvent.setup();
    renderRoute('/admin/support');
    const table = await main().findByRole('table');
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((row) => within(row).getByRole('rowheader').querySelector('a')!.textContent)).toEqual(['Old question', 'New question']);
    expect(rows[0]).toHaveTextContent('30 hours');
    expect(rows[1]).toHaveTextContent('Under an hour');
    expect(main().getByRole('button', { name: 'Needs reply, 2 conversations' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(main().getByRole('button', { name: 'Waiting on shopper, 1 conversation' }));
    expect(within(main().getByRole('table')).getByRole('link', { name: 'Answered' })).toBeInTheDocument();
    await user.click(main().getByRole('button', { name: 'All, 3 conversations' }));
    await user.type(main().getByRole('textbox', { name: 'Search messages' }), 'grace');
    expect(within(main().getByRole('table')).getAllByRole('row')).toHaveLength(2);
    expect(old.id).toBe('HC-1001');
  });

  it('answers with a saved reply and closes the conversation', async () => {
    const shopper = await ada();
    const ticket = await submitContact(shopper, message({ topic: 'other', subject: 'Thank you' }));
    const user = userEvent.setup();
    renderRoute(`/admin/support/${ticket.id}`);
    expect(await main().findByRole('heading', { level: 2, name: 'Thank you' })).toBeInTheDocument();
    expect(main().getByText('Has an account · 0 orders')).toBeInTheDocument();

    await user.selectOptions(main().getByLabelText('Start from a saved reply'), 'Glad to help, closing');
    expect(main().getByLabelText('Your reply')).toHaveValue(
      "Hi Ada,\n\nGlad that's sorted. I'll close this conversation, but just reply if anything else comes up.",
    );
    await user.click(main().getByRole('checkbox', { name: 'Close the conversation after sending' }));
    await user.click(main().getByRole('button', { name: 'Send reply' }));

    expect(await screen.findByText('Reply sent and closed')).toBeInTheDocument();
    expect(main().getByRole('button', { name: 'Reopen conversation' })).toBeInTheDocument();
    expect(within(main().getByRole('list', { name: 'Conversation' })).getAllByRole('article')).toHaveLength(2);
    expect(loadOutbox().at(-1)).toMatchObject({ to: 'ada@example.com', subject: `Re: Thank you [${ticket.id}]` });
  });

  it('reloads instead of replying when the shopper has written meanwhile', async () => {
    const shopper = await ada();
    const ticket = await submitContact(shopper, message());
    const user = userEvent.setup();
    renderRoute(`/admin/support/${ticket.id}`);
    await user.type(await main().findByLabelText('Your reply'), 'Yes, a little.');
    await replyAsShopper(shopper, ticket.id, 'Actually, never mind!');
    await user.click(main().getByRole('button', { name: 'Send reply' }));

    expect(await screen.findByText('New message from the shopper')).toBeInTheDocument();
    await waitFor(() => expect(within(main().getByRole('list', { name: 'Conversation' })).getAllByRole('article')).toHaveLength(2));
    expect(main().getByText('Actually, never mind!')).toBeInTheDocument();
    expect(loadOutbox().filter((email) => email.subject.startsWith('Re:'))).toHaveLength(0);
  });
});
