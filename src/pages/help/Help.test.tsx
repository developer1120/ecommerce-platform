import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { signUp } from '@/api/authApi';
import { placeOrder } from '@/api/ordersApi';
import { loadOutbox } from '@/api/outbox';
import { loadTickets, submitContact } from '@/api/supportApi';
import { CATALOG } from '@/data/catalog';
import { makeCartLine } from '@/domain/cart';
import { HELP_VOTES_KEY } from '@/domain/help';
import { EMPTY_CONTACT } from '@/domain/support';
import { SESSION_TOKEN_KEY } from '@/state/AuthProvider';
import { axeViolations } from '@/test/axe';
import { renderRoute } from '@/test/renderRoute';

const main = () => within(screen.getByRole('main'));
const MUG = CATALOG.find((product) => product.slug === 'stoneware-mug-set')!;

async function orderAs(email: string) {
  return placeOrder({
    idempotencyKey: Math.random().toString(),
    lines: [{ ...makeCartLine(MUG, MUG.variants[0]!), quantity: 1 }],
    methodId: 'standard',
    address: { email, firstName: 'Ada', lastName: 'Lovelace', line1: '12 Analytical Way', line2: '', city: 'Brooklyn', state: 'NY', zip: '11201', phone: '' },
    card: { brand: 'visa', last4: '4242', expMonth: 4, expYear: 2029, name: 'Ada Lovelace' },
  });
}

const answerFor = (question: string) => screen.getByText(question, { selector: 'summary' }).closest('details')!;

describe('the help centre', () => {
  it('lists the topics and finds answers as you type', async () => {
    const user = userEvent.setup();
    const { router } = renderRoute('/help');
    expect(await main().findByRole('heading', { level: 1, name: 'How can we help?' })).toBeInTheDocument();
    const topics = main().getByRole('heading', { name: 'Browse by topic' }).nextElementSibling as HTMLElement;
    expect(within(topics).getAllByRole('link')).toHaveLength(6);

    await user.type(main().getByRole('searchbox', { name: 'Search help' }), 'refund');
    expect(await main().findByRole('heading', { name: /answers for “refund”/ })).toBeInTheDocument();
    expect(router.state.location.search).toBe('?q=refund');

    await user.click(main().getByRole('link', { name: /When will I get my refund\?/ }));
    expect(await main().findByRole('heading', { level: 1, name: 'Returns and refunds' })).toBeInTheDocument();
    expect(router.state.location.hash).toBe('#refund-timing');
    expect(answerFor('When will I get my refund?')).toHaveAttribute('open');
    expect(answerFor('How do I start a return?')).not.toHaveAttribute('open');
  });

  it('says when nothing matches and points to the contact form', async () => {
    renderRoute('/help?q=spaceship');
    expect(await main().findByRole('heading', { name: 'No answers found' })).toBeInTheDocument();
    expect(main().getByRole('link', { name: 'ask the studio' })).toHaveAttribute('href', '/help/contact');
  });

  it('is reached from the footer', async () => {
    const user = userEvent.setup();
    renderRoute('/');
    const footer = await screen.findByRole('contentinfo');
    await user.click(within(footer).getByRole('link', { name: 'Shipping' }));
    expect(await main().findByRole('heading', { level: 1, name: 'Shipping and delivery' })).toBeInTheDocument();
    await user.click(within(screen.getByRole('contentinfo')).getByRole('link', { name: 'Contact us' }));
    expect(await main().findByRole('heading', { level: 1, name: 'Contact us' })).toBeInTheDocument();
  });

  it('shows the missing page for an unknown topic', async () => {
    renderRoute('/help/teleporting');
    expect(await main().findByRole('heading', { level: 1, name: 'This page has wandered off' })).toBeInTheDocument();
  });
});

describe('a help topic', () => {
  it('opens and closes every answer', async () => {
    const user = userEvent.setup();
    renderRoute('/help/care');
    await user.click(await main().findByRole('button', { name: 'Open all answers' }));
    const questions = ['How should I wash linen?', 'How do I look after wooden boards?'];
    for (const question of questions) expect(answerFor(question)).toHaveAttribute('open');
    await user.click(main().getByRole('button', { name: 'Close all answers' }));
    for (const question of questions) expect(answerFor(question)).not.toHaveAttribute('open');

    await user.click(screen.getByText('How should I wash linen?'));
    expect(answerFor('How should I wash linen?')).toHaveAttribute('open');
    expect(main().getByRole('button', { name: 'Open all answers' })).toBeInTheDocument();
  });

  it('asks whether an answer helped and remembers the vote', async () => {
    const user = userEvent.setup();
    const { unmount } = renderRoute('/help/returns#exchange');
    const exchange = within(await main().findByRole('group', { name: /“Can I exchange an item.*” helpful/ }));
    await user.click(exchange.getByRole('button', { name: 'No' }));
    expect(exchange.getByRole('status')).toHaveTextContent("Sorry it didn't help.");
    expect(exchange.getByRole('link', { name: 'Ask the studio' })).toHaveAttribute('href', '/help/contact?topic=return');
    expect(JSON.parse(localStorage.getItem(HELP_VOTES_KEY)!)).toEqual({ exchange: 'no' });

    unmount();
    renderRoute('/help/returns#exchange');
    expect(await main().findByText(/Sorry it didn't help/)).toBeInTheDocument();
  });
});

describe('the contact form', () => {
  it('lists the problems, then sends the message and confirms it', async () => {
    const user = userEvent.setup();
    renderRoute('/help/contact');
    await user.click(await main().findByRole('button', { name: 'Send message' }));
    const summary = await main().findByRole('alert');
    expect(summary).toHaveTextContent('There are 5 problems');
    expect(within(summary).getByRole('link', { name: 'Choose what your message is about' })).toHaveAttribute('href', '#contact-topic');

    await user.type(main().getByLabelText('Your name'), 'Grace Hopper');
    await user.type(main().getByLabelText('Email'), 'grace@example.com');
    expect(main().queryByLabelText('Order number (optional)')).not.toBeInTheDocument();
    await user.click(main().getByRole('radio', { name: /A product/ }));
    await user.type(main().getByLabelText('Subject'), 'Cushion fabric');
    await user.type(main().getByLabelText('Message'), 'Is the bouclé cushion cover removable?');
    expect(main().getByText('38 / 2000')).toBeInTheDocument();
    await user.click(main().getByRole('button', { name: 'Send message' }));

    const sent = await main().findByRole('status');
    expect(sent).toHaveTextContent('Message sent');
    expect(sent).toHaveTextContent('Your reference is HC-1001');
    expect(loadTickets()).toEqual([
      expect.objectContaining({ id: 'HC-1001', topic: 'product', email: 'grace@example.com', status: 'open', subject: 'Cushion fabric' }),
    ]);
    expect(loadOutbox().at(-1)).toMatchObject({ to: 'grace@example.com', subject: "We've got your message [HC-1001]" });
  });

  it('fills in a signed-in shopper and links their order', async () => {
    const user = userEvent.setup();
    const { token, user: ada } = await signUp({ name: 'Ada Lovelace', email: 'ada@example.com', password: 'slow mornings with tea', remember: true });
    localStorage.setItem(SESSION_TOKEN_KEY, JSON.stringify(token));
    const order = await orderAs('ada@example.com');

    renderRoute(`/help/contact?topic=order&order=${order.id.toLowerCase()}`);
    expect(await main().findByLabelText('Your name')).toHaveValue('Ada Lovelace');
    expect(main().getByLabelText('Email')).toHaveValue('ada@example.com');
    expect(main().getByRole('radio', { name: /An order/ })).toBeChecked();
    await user.type(main().getByLabelText('Subject'), 'Wrong glaze');
    await user.type(main().getByLabelText('Message'), 'I picked Lilac but meant Moss, can you swap it?');
    await user.click(main().getByRole('button', { name: 'Send message' }));

    expect(await main().findByText(/Your reference is/)).toBeInTheDocument();
    expect(loadTickets()[0]).toMatchObject({ customerId: ada.id, orderId: order.id });
  });

  it('keeps an order that is not the sender’s out of the ticket', async () => {
    const order = await orderAs('ada@example.com');
    const form = { ...EMPTY_CONTACT, name: 'Mallory', email: 'mallory@example.com', topic: 'order' as const, subject: 'Hi', message: 'Where is my parcel please?' };
    const ticket = await submitContact(null, { ...form, orderId: order.id });
    expect(ticket.orderId).toBeUndefined();
    expect(ticket.messages[0]!.body).toContain(`(Order number given: ${order.id})`);
  });

  it('limits how many messages one address sends an hour', async () => {
    const user = userEvent.setup();
    const form = { ...EMPTY_CONTACT, name: 'Ada', email: 'ada@example.com', topic: 'other' as const, subject: 'Hello', message: 'Just saying hello to the studio.' };
    for (let count = 0; count < 3; count += 1) await submitContact(null, form);

    renderRoute('/help/contact?topic=other');
    await user.type(await main().findByLabelText('Your name'), 'Ada');
    await user.type(main().getByLabelText('Email'), 'ada@example.com');
    await user.type(main().getByLabelText('Subject'), 'Again');
    await user.type(main().getByLabelText('Message'), 'One more message for the studio.');
    await user.click(main().getByRole('button', { name: 'Send message' }));
    expect(await main().findByRole('alert')).toHaveTextContent("You've sent us several messages in the last hour.");
    expect(loadTickets()).toHaveLength(3);
  });
});

describe('accessibility', () => {
  it.each([
    ['/help?q=linen', 'How can we help?'],
    ['/help/shipping#dispatch', 'Shipping and delivery'],
    ['/help/contact', 'Contact us'],
  ])('%s', async (path, title) => {
    renderRoute(path);
    await main().findByRole('heading', { level: 1, name: title });
    await waitFor(() => expect(document.title).not.toBe(''));
    expect(await axeViolations()).toEqual([]);
  });
});
