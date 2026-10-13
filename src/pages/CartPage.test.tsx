import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { configureApi } from '@/api/client';
import { CATALOG } from '@/data/catalog';
import { cartReducer, EMPTY_CART, makeCartLine, type CartLine, type CartState } from '@/domain/cart';
import { reconcileCart } from '@/domain/cartReconcile';
import { loadCart, saveCart } from '@/domain/cartStorage';
import { renderRoute } from '@/test/renderRoute';

const bySlug = (slug: string) => CATALOG.find((product) => product.slug === slug)!;
const mugs = bySlug('stoneware-mug-set');
const vase = bySlug('hand-thrown-bud-vase'); // Chalk: 3 in stock
const candles = bySlug('beeswax-taper-candles'); // Plum: sold out
const soap = bySlug('cedar-and-vetiver-soap');

function line(product = soap, variantIndex = 0, quantity = 1, overrides: Partial<CartLine> = {}): CartLine {
  return { ...makeCartLine(product, product.variants[variantIndex]!), quantity, ...overrides };
}

function bag(...lines: CartLine[]): CartState {
  return { lines };
}

describe('reconcileCart', () => {
  it('leaves an up-to-date bag alone and returns the same state', () => {
    const state = bag(line(soap, 0, 2), line(mugs, 0, 1));
    const result = reconcileCart(state, CATALOG);
    expect(result).toEqual({ state, notices: [], changed: false });
    expect(result.state).toBe(state);
  });

  it('removes products that no longer exist', () => {
    const result = reconcileCart(bag(line(soap), line(mugs)), CATALOG.filter((p) => p.id !== 'hk-mug'));
    expect(result.state.lines.map((l) => l.productId)).toEqual(['ra-soap']);
    expect(result.notices).toEqual([
      expect.objectContaining({ kind: 'removed', message: 'Stoneware mug set (Speckled) is no longer available, so we removed it.' }),
    ]);
  });

  it('removes variants that have sold out', () => {
    const plum = line(candles, 1, 2, { stock: 4 });
    const result = reconcileCart(bag(plum), CATALOG);
    expect(result.state.lines).toEqual([]);
    expect(result.notices[0]).toMatchObject({ kind: 'sold-out', message: 'Beeswax taper candles (Plum) has sold out, so we removed it.' });
  });

  it('lowers quantities above the remaining stock', () => {
    const result = reconcileCart(bag(line(vase, 0, 5, { stock: 9 })), CATALOG);
    expect(result.state.lines[0]).toMatchObject({ quantity: 3, stock: 3 });
    expect(result.notices[0]!.message).toBe('Only 3 of Hand-thrown bud vase (Chalk) are left, so we lowered your quantity.');
  });

  it('updates changed prices in both directions and says so', () => {
    const cheaper = line(mugs, 0, 1, { unitPrice: 3500 });
    const dearer = line(soap, 0, 1, { unitPrice: 1500 });
    const result = reconcileCart(bag(cheaper, dearer), CATALOG);
    expect(result.state.lines.map((l) => l.unitPrice)).toEqual([3840, 1200]);
    expect(result.notices.map((n) => [n.kind, n.message])).toEqual([
      ['price-up', 'Stoneware mug set (Speckled) went up from $35.00 to $38.40.'],
      ['price-down', 'Cedar and vetiver soap dropped from $15.00 to $12.00.'],
    ]);
  });

  it('quietly refreshes a stale stock count without a notice', () => {
    const result = reconcileCart(bag(line(soap, 0, 1, { stock: 5 })), CATALOG);
    expect(result.changed).toBe(true);
    expect(result.notices).toEqual([]);
    expect(result.state.lines[0]!.stock).toBe(60);
  });

  it('keeps when each line was added', () => {
    const old = line(soap, 0, 1, { addedAt: '2026-01-01T00:00:00.000Z', unitPrice: 999 });
    expect(reconcileCart(bag(old), CATALOG).state.lines[0]!.addedAt).toBe('2026-01-01T00:00:00.000Z');
  });
});

describe('CartPage', () => {
  function seed(...lines: CartLine[]) {
    saveCart(lines.reduce((state, { quantity, ...snapshot }) => cartReducer(state, { type: 'add', line: snapshot, quantity }), EMPTY_CART));
  }

  it('lists the bag with a summary', async () => {
    seed(line(mugs, 0, 2), line(soap, 0, 1));
    renderRoute('/cart');
    expect(screen.getByRole('heading', { level: 1, name: 'Your bag' })).toBeInTheDocument();
    expect(screen.getByText('3 items')).toBeInTheDocument();
    expect(document.title).toBe('Your bag · Tanelt');

    const summary = screen.getByRole('complementary', { name: 'Order summary' });
    expect(within(summary).getByText('Subtotal').parentElement).toHaveTextContent('$88.80');
    expect(within(summary).getByText('Sale savings included').parentElement).toHaveTextContent('$19.20');
    expect(within(summary).getByText('Total before tax').parentElement).toHaveTextContent('$88.80');
    expect(within(summary).getByText('Your order ships free.')).toBeInTheDocument();
  });

  it('corrects a stale bag on arrival and explains every change', async () => {
    // Saved with an old price, more vases than exist, and a sold-out candle.
    saveCart(bag(line(mugs, 0, 1, { unitPrice: 3500 }), line(vase, 0, 5, { stock: 9 }), line(candles, 1, 2, { stock: 4 })));
    renderRoute('/cart');

    const notices = await screen.findByRole('region', { name: 'We updated your bag' });
    expect(within(notices).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Stoneware mug set (Speckled) went up from $35.00 to $38.40.',
      'Only 3 of Hand-thrown bud vase (Chalk) are left, so we lowered your quantity.',
      'Beeswax taper candles (Plum) has sold out, so we removed it.',
    ]);
    expect(screen.getByText('4 items')).toBeInTheDocument();
    // The corrected bag is saved by an effect that can run just after the notices render.
    await waitFor(() =>
      expect(loadCart().lines.map((l) => [l.productId, l.quantity, l.unitPrice])).toEqual([
        ['hk-mug', 1, 3840],
        ['hk-vase', 3, 3200],
      ]),
    );

    await userEvent.click(within(notices).getByRole('button', { name: 'Got it' }));
    expect(screen.queryByRole('region', { name: 'We updated your bag' })).not.toBeInTheDocument();
  });

  it('still explains when the check empties the bag', async () => {
    saveCart(bag(line(candles, 1, 1, { stock: 4 })));
    renderRoute('/cart');
    expect(await screen.findByText('Beeswax taper candles (Plum) has sold out, so we removed it.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Your bag is empty' })).toBeInTheDocument();
  });

  it('keeps the saved bag when the check fails', async () => {
    configureApi({ failureRate: 1 });
    saveCart(bag(line(mugs, 0, 1, { unitPrice: 3500 })));
    renderRoute('/cart');
    expect(await screen.findByRole('heading', { level: 1, name: 'Your bag' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'We updated your bag' })).not.toBeInTheDocument();
    expect(loadCart().lines[0]!.unitPrice).toBe(3500);
  });

  it('edits quantities and removes a line with undo', async () => {
    seed(line(soap, 0, 1), line(mugs, 0, 1));
    renderRoute('/cart');
    const stepper = screen.getByRole('group', { name: 'Quantity of Cedar and vetiver soap' });
    await userEvent.click(within(stepper).getByRole('button', { name: 'Increase' }));
    expect(screen.getByText('3 items')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Remove Stoneware mug set' }));
    expect(screen.getByText('2 items')).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole('region', { name: 'Notifications' })).getByRole('button', { name: 'Undo' }));
    expect(screen.getByText('3 items')).toBeInTheDocument();
  });

  it('removes everything at once and can undo it', async () => {
    seed(line(soap, 0, 2), line(mugs, 0, 1));
    renderRoute('/cart');
    await userEvent.click(screen.getByRole('button', { name: 'Remove all' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Your bag is empty' })).toBeInTheDocument();
    expect(loadCart().lines).toEqual([]);

    await userEvent.click(within(screen.getByRole('region', { name: 'Notifications' })).getByRole('button', { name: 'Undo' }));
    expect(screen.getByText('3 items')).toBeInTheDocument();
  });

  it('shows an empty state with ways back into the shop', () => {
    renderRoute('/cart');
    expect(screen.getByRole('heading', { level: 1, name: 'Your bag is empty' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Shop new arrivals' })).toHaveAttribute('href', '/shop/new');
  });

  it('is reached from the drawer', async () => {
    seed(line(soap, 0, 1));
    const { router } = renderRoute('/');
    await userEvent.click(screen.getByRole('button', { name: /^Bag/ }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('link', { name: 'View bag' }));
    expect(router.state.location.pathname).toBe('/cart');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('shipping and tax estimate', () => {
  function seedOne(slug: string, quantity: number) {
    const product = bySlug(slug);
    saveCart(cartReducer(EMPTY_CART, { type: 'add', line: makeCartLine(product, product.variants[0]!), quantity }));
  }
  const summary = () => screen.getByRole('complementary', { name: 'Order summary' });
  const row = (label: string | RegExp) => within(summary()).getByText(label).parentElement!;

  it('adds standard shipping and asks for a state before showing tax', () => {
    seedOne('cedar-and-vetiver-soap', 2); // $24
    renderRoute('/cart');
    expect(row('Shipping (standard)')).toHaveTextContent('$5.95');
    expect(row('Tax')).toHaveTextContent('Choose a state');
    expect(row('Total before tax')).toHaveTextContent('$29.95');
  });

  it('shows each delivery method with its price and dates', () => {
    seedOne('cedar-and-vetiver-soap', 2);
    renderRoute('/cart');
    const delivery = within(summary()).getByRole('group', { name: 'Delivery' });
    expect(within(delivery).getByRole('radio', { name: /standard/i }).closest('label')).toHaveTextContent('Tue, Oct 13 – Thu, Oct 15$5.95');
    expect(within(delivery).getByRole('radio', { name: /next day/i }).closest('label')).toHaveTextContent('Fri, Oct 9$24.95');
  });

  it('switches method and adds state tax, remembering both', async () => {
    seedOne('cedar-and-vetiver-soap', 2);
    renderRoute('/cart');
    await userEvent.selectOptions(within(summary()).getByRole('combobox', { name: 'Ship to' }), 'CA');
    await userEvent.click(within(summary()).getByRole('radio', { name: /express/i }));

    expect(row('Shipping (express)')).toHaveTextContent('$14.95');
    // 7.25% of $24.00 = $1.74.
    expect(row('Tax (CA 7.25%)')).toHaveTextContent('$1.74');
    expect(row('Total')).toHaveTextContent('$40.69');
    expect(JSON.parse(localStorage.getItem('tanelt:estimate')!)).toEqual({ state: 'CA', method: 'express' });
  });

  it('notes clothing exemptions', async () => {
    seedOne('organic-cotton-tee', 1);
    renderRoute('/cart');
    await userEvent.selectOptions(within(summary()).getByRole('combobox', { name: 'Ship to' }), 'PA');
    expect(row('Tax (PA 6%)')).toHaveTextContent('$0.36');
    expect(within(summary()).getByText("Pennsylvania doesn't tax apparel items.")).toBeInTheDocument();
  });

  it('marks standard shipping free over the threshold but still charges for faster methods', async () => {
    seedOne('washed-linen-throw', 1); // $96
    renderRoute('/cart');
    expect(row('Shipping (standard)')).toHaveTextContent('Free');
    await userEvent.click(within(summary()).getByRole('radio', { name: /express/i }));
    expect(row('Shipping (express)')).toHaveTextContent('$14.95');
  });

  it('drops next day for Hawaii and falls back to standard', async () => {
    localStorage.setItem('tanelt:estimate', JSON.stringify({ state: null, method: 'next-day' }));
    seedOne('cedar-and-vetiver-soap', 1);
    renderRoute('/cart');
    expect(row('Shipping (next day)')).toHaveTextContent('$24.95');

    await userEvent.selectOptions(within(summary()).getByRole('combobox', { name: 'Ship to' }), 'HI');
    expect(within(summary()).queryByRole('radio', { name: /next day/i })).not.toBeInTheDocument();
    expect(within(summary()).getByText("Next-day delivery isn't available to Hawaii.")).toBeInTheDocument();
    expect(row('Shipping (standard)')).toHaveTextContent('$15.95');
  });

  it('ignores a damaged saved estimate', () => {
    localStorage.setItem('tanelt:estimate', JSON.stringify({ state: 7, method: 'teleport' }));
    seedOne('cedar-and-vetiver-soap', 1);
    renderRoute('/cart');
    expect(row('Shipping (standard)')).toBeInTheDocument();
  });
});
