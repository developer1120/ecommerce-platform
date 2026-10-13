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
