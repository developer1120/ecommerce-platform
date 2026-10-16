import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CATALOG } from '@/data/catalog';
import { cartReducer, EMPTY_CART, makeCartLine, type CartState } from '@/domain/cart';
import { saveCart } from '@/domain/cartStorage';
import { CHECKOUT_STORAGE_KEY } from '@/state/CheckoutProvider';
import { renderRoute } from '@/test/renderRoute';

const bySlug = (slug: string) => CATALOG.find((product) => product.slug === slug)!;

function seedBag(...items: [slug: string, quantity: number][]) {
  let state: CartState = EMPTY_CART;
  for (const [slug, quantity] of items) {
    const product = bySlug(slug);
    state = cartReducer(state, { type: 'add', line: makeCartLine(product, product.variants[0]!), quantity });
  }
  saveCart(state);
}

// Scoped to main: the footer has its own email field.
const field = (name: RegExp | string) => within(screen.getByRole('main')).getByRole('textbox', { name });

async function fillAddress(overrides: Partial<Record<string, string>> = {}) {
  const values = {
    email: 'ada@example.com',
    first: 'Ada',
    last: 'Lovelace',
    street: '12 Analytical Way',
    city: 'Brooklyn',
    state: 'NY',
    zip: '11201',
    ...overrides,
  };
  await userEvent.type(field(/^email/i), values.email);
  await userEvent.type(field(/^first name/i), values.first);
  await userEvent.type(field(/^last name/i), values.last);
  await userEvent.type(field(/^street address/i), values.street);
  await userEvent.type(field(/^city/i), values.city);
  await userEvent.selectOptions(screen.getByRole('combobox', { name: /^state/i }), values.state);
  await userEvent.type(field(/^zip code/i), values.zip);
}

describe('checkout entry', () => {
  it('sends an empty bag back to the bag page', () => {
    const { router } = renderRoute('/checkout');
    expect(router.state.location.pathname).toBe('/cart');
  });

  it('is reached from the bag page and the drawer', async () => {
    seedBag(['cedar-and-vetiver-soap', 1]);
    const { router } = renderRoute('/cart');
    await userEvent.click(screen.getByRole('link', { name: 'Checkout' }));
    expect(router.state.location.pathname).toBe('/checkout');

    await userEvent.click(screen.getByRole('button', { name: /^Bag/ }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('link', { name: 'Checkout' }));
    expect(router.state.location.pathname).toBe('/checkout');
  });

  it('shows progress and the order beside the form', () => {
    seedBag(['washed-linen-throw', 1], ['cedar-and-vetiver-soap', 2]);
    renderRoute('/checkout');
    expect(screen.getByRole('heading', { level: 1, name: 'Checkout' })).toBeInTheDocument();
    expect(document.title).toBe('Checkout · Tanelt');

    const progress = screen.getByRole('navigation', { name: 'Checkout progress' });
    expect(within(progress).getByText('Address').closest('[aria-current]')).toHaveAttribute('aria-current', 'step');
    expect(within(progress).queryAllByRole('link')).toHaveLength(0);

    const order = screen.getByRole('complementary', { name: 'Your order' });
    expect(within(order).getByText('3 items')).toBeInTheDocument();
    expect(within(order).getByText('Total before tax').parentElement).toHaveTextContent('$120.00');
  });

  it('starts from the state chosen on the bag page and taxes for it', () => {
    localStorage.setItem('tanelt:estimate', JSON.stringify({ state: 'NY', method: 'standard' }));
    seedBag(['washed-linen-throw', 1]);
    renderRoute('/checkout');
    expect(screen.getByRole('combobox', { name: /^state/i })).toHaveValue('NY');
    const order = screen.getByRole('complementary', { name: 'Your order' });
    expect(within(order).getByText('Tax (NY 4%)').parentElement).toHaveTextContent('$3.84');
  });
});

describe('address step', () => {
  it('lists every problem on submit, focuses the list and links to each field', async () => {
    seedBag(['cedar-and-vetiver-soap', 1]);
    const { router } = renderRoute('/checkout');
    await userEvent.click(screen.getByRole('button', { name: 'Continue to delivery' }));

    const summary = screen.getByRole('alert');
    expect(summary).toHaveFocus();
    expect(within(summary).getByRole('heading')).toHaveTextContent('There are 7 problems');
    expect(router.state.location.pathname).toBe('/checkout');

    await userEvent.click(within(summary).getByRole('link', { name: 'Enter the city' }));
    expect(field(/^city/i)).toHaveFocus();
    expect(field(/^city/i)).toHaveAccessibleDescription('Enter the city');
  });

  it('checks a field when the shopper leaves it, and clears the error once fixed', async () => {
    seedBag(['cedar-and-vetiver-soap', 1]);
    renderRoute('/checkout');
    const email = field(/^email/i);
    await userEvent.type(email, 'ada@');
    await userEvent.tab();
    expect(email).toHaveAccessibleDescription(/Enter an email address like name@example.com/);

    await userEvent.type(email, 'example.com');
    expect(email).not.toHaveAttribute('aria-invalid');
  });

  it('does not complain about a required field that was only tabbed through', async () => {
    seedBag(['cedar-and-vetiver-soap', 1]);
    renderRoute('/checkout');
    field(/^email/i).focus();
    await userEvent.tab();
    expect(field(/^email/i)).not.toHaveAttribute('aria-invalid');
  });

  it('rechecks the ZIP when the state changes', async () => {
    seedBag(['cedar-and-vetiver-soap', 1]);
    renderRoute('/checkout');
    await fillAddress({ zip: '94107' });
    await userEvent.tab();
    expect(field(/^zip code/i)).toHaveAccessibleDescription("That ZIP code isn't in New York. Check the ZIP or the state.");

    await userEvent.selectOptions(screen.getByRole('combobox', { name: /^state/i }), 'CA');
    expect(field(/^zip code/i)).not.toHaveAttribute('aria-invalid');
  });

  it('saves a valid address, tidied, and moves on to delivery', async () => {
    seedBag(['cedar-and-vetiver-soap', 1]);
    const { router } = renderRoute('/checkout');
    await fillAddress({ email: 'Ada@Example.com ' });
    await userEvent.type(field(/^phone/i), '415 555 0100');
    await userEvent.click(screen.getByRole('button', { name: 'Continue to delivery' }));

    expect(router.state.location.pathname).toBe('/checkout/delivery');
    const card = screen.getByText('Shipping to').parentElement!;
    expect(card).toHaveTextContent('Ada Lovelace');
    expect(card).toHaveTextContent('Brooklyn, NY 11201');
    expect(card).toHaveTextContent('ada@example.com');

    const saved = JSON.parse(sessionStorage.getItem(CHECKOUT_STORAGE_KEY)!);
    expect(saved).toMatchObject({ addressConfirmed: true, address: { email: 'ada@example.com', phone: '(415) 555-0100' } });

    const progress = screen.getByRole('navigation', { name: 'Checkout progress' });
    expect(within(progress).getByRole('link', { name: /address \(completed\)/i })).toHaveAttribute('href', '/checkout');
  });

  it('goes back to edit with everything filled in', async () => {
    seedBag(['cedar-and-vetiver-soap', 1]);
    renderRoute('/checkout');
    await fillAddress();
    await userEvent.click(screen.getByRole('button', { name: 'Continue to delivery' }));
    await userEvent.click(screen.getByRole('link', { name: 'Change address' }));
    expect(field(/^first name/i)).toHaveValue('Ada');
    expect(field(/^zip code/i)).toHaveValue('11201');
  });

  it('keeps the draft across a reload of the tab', async () => {
    seedBag(['cedar-and-vetiver-soap', 1]);
    const first = renderRoute('/checkout');
    await fillAddress();
    await userEvent.click(screen.getByRole('button', { name: 'Continue to delivery' }));
    first.unmount();

    renderRoute('/checkout/delivery');
    expect(screen.getByText('Shipping to').parentElement).toHaveTextContent('Ada Lovelace');
  });

  it('will not show the delivery step before an address is confirmed', () => {
    seedBag(['cedar-and-vetiver-soap', 1]);
    const { router } = renderRoute('/checkout/delivery');
    expect(router.state.location.pathname).toBe('/checkout');
  });
});

describe('delivery, payment and review', () => {
  const ADDRESS = {
    email: 'ada@example.com',
    firstName: 'Ada',
    lastName: 'Lovelace',
    line1: '12 Analytical Way',
    line2: '',
    city: 'Brooklyn',
    state: 'NY',
    zip: '11201',
    phone: '',
  };
  const CARD = { brand: 'visa', last4: '4242', expMonth: 4, expYear: 2029, name: 'Ada Lovelace' };

  function seedDraft(overrides: Record<string, unknown> = {}) {
    sessionStorage.setItem(
      CHECKOUT_STORAGE_KEY,
      JSON.stringify({
        address: ADDRESS,
        addressConfirmed: true,
        methodId: 'standard',
        deliveryConfirmed: false,
        card: null,
        ...overrides,
      }),
    );
  }

  const main = () => within(screen.getByRole('main'));
  const order = () => screen.getByRole('complementary', { name: 'Your order' });

  async function fillCard(card: Partial<Record<'number' | 'expiry' | 'cvc', string>> = {}) {
    const values = { number: '4242424242424242', expiry: '0429', cvc: '123', ...card };
    await userEvent.type(main().getByRole('textbox', { name: /^card number/i }), values.number);
    await userEvent.type(main().getByRole('textbox', { name: /^expiry date/i }), values.expiry);
    await userEvent.type(main().getByRole('textbox', { name: /^security code/i }), values.cvc);
  }

  it('offers each delivery speed with its dates and price, updating the order total', async () => {
    seedBag(['cedar-and-vetiver-soap', 2]); // $24
    seedDraft();
    renderRoute('/checkout/delivery');
    const standard = main().getByRole('radio', { name: /standard/i });
    expect(standard).toBeChecked();
    expect(standard.closest('label')).toHaveTextContent('Arrives Tue, Oct 13 – Thu, Oct 15$5.95');

    await userEvent.click(main().getByRole('radio', { name: /next day/i }));
    expect(within(order()).getByText('Shipping (next day)').parentElement).toHaveTextContent('$24.95');
  });

  it('hides next day for Alaska and falls back to standard', () => {
    seedBag(['cedar-and-vetiver-soap', 1]);
    seedDraft({ address: { ...ADDRESS, city: 'Anchorage', state: 'AK', zip: '99501' }, methodId: 'next-day' });
    renderRoute('/checkout/delivery');
    expect(main().queryByRole('radio', { name: /next day/i })).not.toBeInTheDocument();
    expect(main().getByRole('radio', { name: /standard/i })).toBeChecked();
    expect(main().getByText("Next-day delivery isn't available to Alaska.")).toBeInTheDocument();
  });

  it('continues to payment, where the name is filled from the address and the demo is explained', async () => {
    seedBag(['cedar-and-vetiver-soap', 1]);
    seedDraft();
    const { router } = renderRoute('/checkout/delivery');
    await userEvent.click(main().getByRole('radio', { name: /express/i }));
    await userEvent.click(main().getByRole('button', { name: 'Continue to payment' }));

    expect(router.state.location.pathname).toBe('/checkout/payment');
    expect(JSON.parse(sessionStorage.getItem(CHECKOUT_STORAGE_KEY)!)).toMatchObject({
      methodId: 'express',
      deliveryConfirmed: true,
    });
    expect(main().getByRole('textbox', { name: /^name on card/i })).toHaveValue('Ada Lovelace');
    expect(main().getByText(/this is a demo shop/i)).toHaveTextContent('4242 4242 4242 4242');
  });

  it('formats the card as it is typed and names the brand', async () => {
    seedBag(['cedar-and-vetiver-soap', 1]);
    seedDraft({ deliveryConfirmed: true });
    renderRoute('/checkout/payment');
    await fillCard({ number: '378282246310005', cvc: '1234' });
    expect(main().getByRole('textbox', { name: /^card number/i })).toHaveValue('3782 822463 10005');
    expect(main().getByText('American Express')).toBeInTheDocument();
    expect(main().getByRole('textbox', { name: /^expiry date/i })).toHaveValue('04 / 29');
    expect(main().getByRole('textbox', { name: /^security code/i })).toHaveAccessibleDescription(/4 digits, on the front/);
  });

  it('lists card problems in a focused summary', async () => {
    seedBag(['cedar-and-vetiver-soap', 1]);
    seedDraft({ deliveryConfirmed: true });
    renderRoute('/checkout/payment');
    await fillCard({ number: '4242424242424241', expiry: '0920' });
    await userEvent.click(main().getByRole('button', { name: 'Continue to review' }));

    const summary = main().getByRole('alert');
    expect(summary).toHaveFocus();
    expect(within(summary).getAllByRole('link').map((link) => link.textContent)).toEqual([
      'That card number has a typo. Check it and try again',
      'This card has expired',
    ]);
  });

  it('keeps only the safe parts of the card and moves on to review', async () => {
    seedBag(['cedar-and-vetiver-soap', 1]);
    seedDraft({ deliveryConfirmed: true });
    const { router } = renderRoute('/checkout/payment');
    await fillCard();
    await userEvent.click(main().getByRole('button', { name: 'Continue to review' }));

    expect(router.state.location.pathname).toBe('/checkout/review');
    const stored = sessionStorage.getItem(CHECKOUT_STORAGE_KEY)!;
    expect(JSON.parse(stored).card).toEqual(CARD);
    expect(stored).not.toContain('4242424242424242');
    expect(stored).not.toContain('4242 4242');
    expect(localStorage.getItem(CHECKOUT_STORAGE_KEY)).toBeNull();
  });

  it('shows a saved card instead of the form and lets the shopper replace it', async () => {
    seedBag(['cedar-and-vetiver-soap', 1]);
    seedDraft({ deliveryConfirmed: true, card: CARD });
    renderRoute('/checkout/payment');
    expect(main().getByText('Visa ending 4242')).toBeInTheDocument();
    expect(main().queryByRole('textbox', { name: /^card number/i })).not.toBeInTheDocument();

    await userEvent.click(main().getByRole('button', { name: 'Use a different card' }));
    expect(main().getByRole('textbox', { name: /^card number/i })).toHaveValue('');
    await userEvent.click(main().getByRole('button', { name: 'Keep Visa ending 4242' }));
    expect(main().getByText('Visa ending 4242')).toBeInTheDocument();
  });

  it('reviews every choice with links back to change each', () => {
    seedBag(['cedar-and-vetiver-soap', 2], ['washed-linen-throw', 1]);
    seedDraft({ deliveryConfirmed: true, methodId: 'express', card: CARD });
    renderRoute('/checkout/review');

    expect(main().getByRole('heading', { name: 'Review your order' })).toBeInTheDocument();
    expect(main().getByText('Shipping to').parentElement).toHaveTextContent('Brooklyn, NY 11201');
    expect(main().getByText('Express, arriving Fri, Oct 9 – Mon, Oct 12')).toBeInTheDocument();
    expect(main().getByText('Visa ending 4242')).toBeInTheDocument();
    expect(main().getByRole('link', { name: 'Change delivery' })).toHaveAttribute('href', '/checkout/delivery');
    expect(main().getByRole('link', { name: 'Change payment' })).toHaveAttribute('href', '/checkout/payment');

    const items = main().getByRole('region', { name: 'Items' });
    expect(within(items).getAllByRole('listitem')).toHaveLength(2);
    expect(within(items).getAllByRole('listitem')[0]).toHaveTextContent('Qty 2');

    const progress = screen.getByRole('navigation', { name: 'Checkout progress' });
    expect(within(progress).getAllByRole('link')).toHaveLength(3);
  });

  it('sends the shopper back to the first unfinished step', () => {
    seedBag(['cedar-and-vetiver-soap', 1]);
    seedDraft();
    const review = renderRoute('/checkout/review');
    expect(review.router.state.location.pathname).toBe('/checkout/delivery');
    review.unmount();

    seedDraft({ deliveryConfirmed: true });
    const payment = renderRoute('/checkout/review');
    expect(payment.router.state.location.pathname).toBe('/checkout/payment');
  });

  it('discards a stored draft with a damaged card', () => {
    seedBag(['cedar-and-vetiver-soap', 1]);
    seedDraft({ deliveryConfirmed: true, card: { ...CARD, last4: '42424242' } });
    const { router } = renderRoute('/checkout/review');
    expect(router.state.location.pathname).toBe('/checkout');
  });
});
