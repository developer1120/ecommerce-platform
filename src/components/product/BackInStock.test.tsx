import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { signUp } from '@/api/authApi';
import { findVariant } from '@/api/mockDb';
import { listMyAlerts, loadOutbox, restockVariant, subscribeToRestock } from '@/api/stockAlertsApi';
import { CATALOG } from '@/data/catalog';
import { cartReducer, EMPTY_CART, makeCartLine } from '@/domain/cart';
import { saveCart } from '@/domain/cartStorage';
import { watchedVariants, watchVariant } from '@/domain/restockWatch';
import { SESSION_TOKEN_KEY } from '@/state/AuthProvider';
import { GUEST_WISHLIST_KEY } from '@/state/WishlistProvider';
import { renderRoute } from '@/test/renderRoute';

const PASSWORD = 'slow mornings with tea';
const main = () => within(screen.getByRole('main'));

// Plum taper candles have no stock; the bouclé cushion has none at all.
const PLUM = 'sl-taper-plum';
const CUSHION = 'ff-cush';

async function signedIn() {
  const { token } = await signUp({ name: 'Ada Lovelace', email: 'ada@example.com', password: PASSWORD, remember: true });
  localStorage.setItem(SESSION_TOKEN_KEY, JSON.stringify(token));
  return token;
}

describe('restock alerts on the server', () => {
  it('subscribes once per email and option', async () => {
    const first = await subscribeToRestock(PLUM, 'Ada@Example.com');
    const again = await subscribeToRestock(PLUM, 'ada@example.com');
    expect(first).toMatchObject({ alreadySubscribed: false, alert: { email: 'ada@example.com', status: 'waiting' } });
    expect(again).toMatchObject({ alreadySubscribed: true, alert: { id: first.alert.id } });
  });

  it('refuses a bad email or an option that is in stock', async () => {
    await expect(subscribeToRestock(PLUM, 'nope')).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(subscribeToRestock('ra-soap', 'ada@example.com')).rejects.toMatchObject({
      code: 'VALIDATION',
      message: 'Good news: that option is in stock now.',
    });
  });

  it('emails everyone waiting when the option is restocked, once', async () => {
    await subscribeToRestock(PLUM, 'ada@example.com');
    await subscribeToRestock(PLUM, 'grace@example.com');
    await subscribeToRestock(CUSHION, 'ada@example.com');

    expect(restockVariant(PLUM, 12)).toEqual({ stock: 12, notified: 2 });
    expect(findVariant(PLUM)!.variant.stock).toBe(12);
    expect(loadOutbox()).toEqual([
      expect.objectContaining({ to: 'ada@example.com', subject: 'Back in stock: Beeswax taper candles (Plum)' }),
      expect.objectContaining({ to: 'grace@example.com' }),
    ]);
    expect(loadOutbox()[0]!.body).toContain('/product/beeswax-taper-candles?variant=sl-taper-plum');

    // A second restock has no one left to tell.
    expect(restockVariant(PLUM, 3).notified).toBe(0);
    expect(loadOutbox()).toHaveLength(2);
  });

  it('refuses an empty restock', () => {
    expect(() => restockVariant(PLUM, 0)).toThrow(/at least one/);
  });
});

describe('notify me on a product page', () => {
  it('offers an alert for a sold-out option and confirms it', async () => {
    renderRoute(`/product/beeswax-taper-candles?variant=${PLUM}`);
    const form = await main().findByRole('form', { name: /get an email when beeswax taper candles in plum is back/i });
    await userEvent.type(within(form).getByRole('textbox', { name: 'Email for the alert' }), 'ada@example.com');
    await userEvent.click(within(form).getByRole('button', { name: 'Notify me' }));

    expect(await main().findByText(/we'll email/i)).toHaveTextContent(
      "We'll email ada@example.com as soon as Beeswax taper candles in Plum is back.",
    );
    expect(watchedVariants()).toEqual([PLUM]);
  });

  it('fills in a signed-in email and explains a bad one', async () => {
    await signedIn();
    renderRoute(`/product/beeswax-taper-candles?variant=${PLUM}`);
    const input = await main().findByRole('textbox', { name: 'Email for the alert' });
    await waitFor(() => expect(input).toHaveValue('ada@example.com'));
    await userEvent.clear(input);
    await userEvent.type(input, 'nope');
    await userEvent.click(main().getByRole('button', { name: 'Notify me' }));
    expect(await main().findByText('Enter an email address like name@example.com')).toBeInTheDocument();
  });

  it('is not offered for an option in stock', async () => {
    renderRoute('/product/beeswax-taper-candles');
    await main().findByRole('heading', { level: 1 });
    expect(main().queryByRole('button', { name: 'Notify me' })).not.toBeInTheDocument();
  });

  it('welcomes the shopper back once the option returns, just once', async () => {
    watchVariant(PLUM);
    restockVariant(PLUM, 4);
    const first = renderRoute(`/product/beeswax-taper-candles?variant=${PLUM}`);
    expect(await main().findByText(/back in stock\. you asked us to tell you/i)).toBeInTheDocument();
    expect(watchedVariants()).toEqual([]);
    first.unmount();

    renderRoute(`/product/beeswax-taper-candles?variant=${PLUM}`);
    await main().findByRole('heading', { level: 1 });
    expect(main().queryByText(/back in stock\./i)).not.toBeInTheDocument();
  });
});

describe('low stock', () => {
  it('names options that are nearly gone', async () => {
    renderRoute('/product/relaxed-linen-shirt?variant=ff-shirt-oat-m');
    await main().findByRole('heading', { level: 1 });
    // Oat in XS has 3 left and XL has 4.
    expect(main().getByRole('radio', { name: 'XS, only 3 left' })).toBeInTheDocument();
    expect(main().getByRole('radio', { name: 'XL, only 4 left' })).toBeInTheDocument();
    expect(main().getByRole('radio', { name: 'M' })).toBeChecked();
  });

  it('warns in the bag before the limit is reached', async () => {
    const vase = CATALOG.find((p) => p.slug === 'hand-thrown-bud-vase')!;
    saveCart(cartReducer(EMPTY_CART, { type: 'add', line: makeCartLine(vase, vase.variants[0]!), quantity: 1 }));
    renderRoute('/cart');
    expect(main().getByText('Only 3 left. Order soon.')).toBeInTheDocument();
  });

  it('points sold-out wishlist pieces to the alert form', async () => {
    localStorage.setItem(GUEST_WISHLIST_KEY, JSON.stringify([{ productId: CUSHION, addedAt: '2026-10-01T00:00:00Z', priceAtSave: 6400 }]));
    renderRoute('/wishlist');
    expect(await main().findByRole('link', { name: "Get an email when it's back" })).toHaveAttribute('href', '/product/wool-boucle-cushion');
  });
});

describe('restock alerts in the account', () => {
  it('lists waiting alerts and cancels one', async () => {
    const token = await signedIn();
    await subscribeToRestock(PLUM, 'ada@example.com', token);
    await subscribeToRestock(CUSHION, 'ada@example.com', token);
    renderRoute('/account/details');

    const section = await main().findByRole('region', { name: 'Restock alerts' });
    await within(section).findByRole('link', { name: 'Wool bouclé cushion' });
    expect(within(section).getAllByRole('listitem')).toHaveLength(2);
    expect(within(section).getByText(/· Plum/)).toBeInTheDocument();

    await userEvent.click(within(section).getByRole('button', { name: 'Cancel alert for Wool bouclé cushion' }));
    await waitFor(() => expect(within(section).getAllByRole('listitem')).toHaveLength(1));
    expect((await listMyAlerts(token)).map((alert) => alert.variantId)).toEqual([PLUM]);
  });

  it('explains the feature when there are none', async () => {
    await signedIn();
    renderRoute('/account/details');
    expect(await main().findByText(/choose "notify me" on its page/i)).toBeInTheDocument();
  });
});
