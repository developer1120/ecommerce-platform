import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CATALOG } from '@/data/catalog';
import { cartReducer, EMPTY_CART, makeCartLine, type CartState } from '@/domain/cart';
import { saveCart } from '@/domain/cartStorage';
import { PROMO_STORAGE_KEY } from '@/state/PromoProvider';
import { PROMOTIONS } from '@/data/promotions';
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

const summary = () => screen.getByRole('complementary', { name: 'Order summary' });
const row = (label: string | RegExp) => within(summary()).getByText(label).parentElement!;

async function applyCode(code: string) {
  await userEvent.type(within(summary()).getByRole('textbox', { name: 'Promo code' }), code);
  await userEvent.click(within(summary()).getByRole('button', { name: 'Apply' }));
}

describe('promo codes on the bag page', () => {
  it('applies a code and takes the discount off the total', async () => {
    seedBag(['washed-linen-throw', 1]); // $96
    renderRoute('/cart');
    await applyCode('home15');

    expect(await within(summary()).findByText('HOME15')).toBeInTheDocument();
    expect(within(summary()).getByRole('status')).toHaveTextContent('15% off Home on orders over $50: −$14.40');
    expect(row('Promo HOME15')).toHaveTextContent('−$14.40');
    expect(row('Total before tax')).toHaveTextContent('$81.60');
  });

  it('shows why a code was refused and clears the error on typing', async () => {
    seedBag(['cedar-and-vetiver-soap', 1]); // $12
    renderRoute('/cart');
    await applyCode('take10');

    const input = within(summary()).getByRole('textbox', { name: 'Promo code' });
    await waitFor(() => expect(input).toHaveAccessibleDescription('Add $48.00 more to use TAKE10.'));
    expect(input).toBeInvalid();

    await userEvent.type(input, 'x');
    expect(input).not.toHaveAttribute('aria-invalid');
  });

  it('rejects unknown and expired codes', async () => {
    seedBag(['cedar-and-vetiver-soap', 1]);
    renderRoute('/cart');
    const input = within(summary()).getByRole('textbox', { name: 'Promo code' });

    await applyCode('nope');
    await waitFor(() => expect(input).toHaveAccessibleDescription(/NOPE isn't a code we recognise/));

    await userEvent.clear(input);
    await applyCode('autumn25');
    await waitFor(() => expect(input).toHaveAccessibleDescription('AUTUMN25 ended on Sep 30, 2026.'));
  });

  it('asks for a code when the field is empty', async () => {
    seedBag(['cedar-and-vetiver-soap', 1]);
    renderRoute('/cart');
    await userEvent.click(within(summary()).getByRole('button', { name: 'Apply' }));
    expect(within(summary()).getByRole('textbox', { name: 'Promo code' })).toHaveAccessibleDescription('Enter a promo code.');
  });

  it('flags the shortfall when an applied code stops qualifying', async () => {
    seedBag(['oak-serving-board', 2]); // 2 × $44 = $88
    renderRoute('/cart');
    await applyCode('take10');
    expect(await within(summary()).findByText('TAKE10')).toBeInTheDocument();

    const stepper = screen.getByRole('group', { name: /quantity of oak serving board/i });
    await userEvent.click(within(stepper).getByRole('button', { name: 'Decrease' }));
    expect(within(summary()).getByRole('status')).toHaveTextContent('Add $16.00 more to use TAKE10.');
    expect(within(summary()).queryByText('Promo TAKE10')).not.toBeInTheDocument();
    // $44 is under the free-shipping threshold, so standard shipping ($5.95) is added.
    expect(row('Total before tax')).toHaveTextContent('$49.95');
  });

  it('marks shipping free for a free-shipping code', async () => {
    seedBag(['cedar-and-vetiver-soap', 1]);
    renderRoute('/cart');
    await applyCode('SHIPFREE');
    expect(await within(summary()).findByText('Free standard shipping applied')).toBeInTheDocument();
    expect(row(/^Shipping/)).toHaveTextContent('Free');
  });

  it('removes a code', async () => {
    seedBag(['washed-linen-throw', 1]);
    renderRoute('/cart');
    await applyCode('home15');
    await userEvent.click(await within(summary()).findByRole('button', { name: 'Remove code HOME15' }));
    expect(within(summary()).getByRole('textbox', { name: 'Promo code' })).toBeInTheDocument();
    expect(row('Total before tax')).toHaveTextContent('$96.00');
    expect(localStorage.getItem(PROMO_STORAGE_KEY)).toBeNull();
  });

  it('remembers the applied code across visits and shows it in the drawer', async () => {
    seedBag(['washed-linen-throw', 1]);
    localStorage.setItem(PROMO_STORAGE_KEY, JSON.stringify(PROMOTIONS.find((p) => p.code === 'HOME15')));
    renderRoute('/');
    await userEvent.click(screen.getByRole('button', { name: /^Bag/ }));
    const bag = screen.getByRole('dialog');
    expect(within(bag).getByText('Promo HOME15').parentElement).toHaveTextContent('−$14.40');
    expect(within(bag).getByText('Subtotal').parentElement).toHaveTextContent('$81.60');
  });

  it('ignores a damaged stored code', () => {
    seedBag(['washed-linen-throw', 1]);
    localStorage.setItem(PROMO_STORAGE_KEY, '{"code":42}');
    renderRoute('/cart');
    expect(within(summary()).getByRole('textbox', { name: 'Promo code' })).toBeInTheDocument();
  });
});
