import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { signUp } from '@/api/authApi';
import { configureApi } from '@/api/client';
import { getWishlist, mergeItems, saveWishlistItem, WISHLISTS_KEY, type WishlistItem } from '@/api/wishlistApi';
import { loadCart } from '@/domain/cartStorage';
import { SESSION_TOKEN_KEY } from '@/state/AuthProvider';
import { GUEST_WISHLIST_KEY } from '@/state/WishlistProvider';
import { renderRoute } from '@/test/renderRoute';

const PASSWORD = 'slow mornings with tea';
const main = () => within(screen.getByRole('main'));

function saved(productId: string, addedAt: string, priceAtSave = 1000): WishlistItem {
  return { productId, addedAt, priceAtSave };
}

function seedGuest(items: WishlistItem[]) {
  localStorage.setItem(GUEST_WISHLIST_KEY, JSON.stringify(items));
}

async function signedInAccount() {
  const { token } = await signUp({ name: 'Ada Lovelace', email: 'ada@example.com', password: PASSWORD, remember: true });
  localStorage.setItem(SESSION_TOKEN_KEY, JSON.stringify(token));
  return token;
}

describe('mergeItems', () => {
  it('keeps one entry per product, the earliest save, newest first', () => {
    const merged = mergeItems(
      [saved('a', '2026-10-01'), saved('b', '2026-10-03')],
      [saved('a', '2026-09-20'), saved('c', '2026-10-02')],
    );
    expect(merged.map((item) => [item.productId, item.addedAt])).toEqual([
      ['b', '2026-10-03'],
      ['c', '2026-10-02'],
      ['a', '2026-09-20'],
    ]);
  });

  it('needs a session on the server', async () => {
    await expect(getWishlist('nope')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});

describe('saving from a product card', () => {
  it('toggles the heart, counts it in the header and confirms with a toast', async () => {
    renderRoute('/shop/beauty');
    const heart = await screen.findByRole('button', { name: 'Save Rose clay mask to your wishlist' });
    expect(heart).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(heart);
    expect(screen.getByRole('button', { name: 'Remove Rose clay mask from your wishlist' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('link', { name: 'Wishlist, 1 saved' })).toHaveAttribute('href', '/wishlist');
    expect(screen.getByRole('region', { name: 'Notifications' })).toHaveTextContent('Saved to your wishlist');

    await userEvent.click(screen.getByRole('button', { name: 'Remove Rose clay mask from your wishlist' }));
    expect(screen.getByRole('link', { name: 'Wishlist' })).toBeInTheDocument();
  });

  it('keeps a guest wishlist on this device', async () => {
    const first = renderRoute('/shop/beauty');
    await userEvent.click(await screen.findByRole('button', { name: 'Save Rose clay mask to your wishlist' }));
    first.unmount();

    expect(JSON.parse(localStorage.getItem(GUEST_WISHLIST_KEY)!)).toEqual([
      expect.objectContaining({ productId: 'ra-mask', priceAtSave: 2400 }),
    ]);
    renderRoute('/');
    expect(screen.getByRole('link', { name: 'Wishlist, 1 saved' })).toBeInTheDocument();
  });

  it('saves from the product page too', async () => {
    renderRoute('/product/oak-serving-board');
    await userEvent.click(await screen.findByRole('button', { name: 'Save Oak serving board to your wishlist' }));
    expect(screen.getByRole('button', { name: 'Remove Oak serving board from your wishlist' })).toHaveTextContent('Saved');
  });
});

describe('wishlist page', () => {
  it('invites saving when empty', () => {
    renderRoute('/wishlist');
    expect(main().getByRole('heading', { name: 'Nothing saved yet' })).toBeInTheDocument();
  });

  it('lists saved products in the order they were saved, newest first', async () => {
    seedGuest([saved('ra-soap', '2026-10-06T00:00:00Z', 1200), saved('gw-board', '2026-10-05T00:00:00Z', 4400)]);
    renderRoute('/wishlist');
    const cards = await main().findAllByRole('article');
    expect(cards.map((card) => within(card).getByRole('heading').textContent)).toEqual([
      'Cedar and vetiver soap',
      'Oak serving board',
    ]);
    expect(main().getByText('2 pieces saved')).toBeInTheDocument();
    expect(main().getByText(/saved on this device only/i)).toBeInTheDocument();
  });

  it('adds a one-option product to the bag and links to options for the rest', async () => {
    seedGuest([saved('ra-soap', '2026-10-06T00:00:00Z', 1200), saved('gw-board', '2026-10-05T00:00:00Z', 4400)]);
    renderRoute('/wishlist');
    const [soap, board] = await main().findAllByRole('article');
    await userEvent.click(within(soap!).getByRole('button', { name: 'Add to bag' }));
    expect(loadCart().lines.map((line) => line.variantId)).toEqual(['ra-soap']);
    expect(within(board!).getByRole('link', { name: 'Choose options' })).toHaveAttribute('href', '/product/oak-serving-board');
  });

  it('points out a price drop since saving', async () => {
    seedGuest([saved('hk-mug', '2026-09-01T00:00:00Z', 4800)]); // now $38.40
    renderRoute('/wishlist');
    expect(await main().findByText(/\$9\.60 less than when you saved it/)).toBeInTheDocument();
  });

  it('marks sold-out pieces', async () => {
    seedGuest([saved('ff-cush', '2026-10-01T00:00:00Z', 6400)]);
    renderRoute('/wishlist');
    expect(await main().findByText('Sold out for now')).toBeInTheDocument();
    expect(main().queryByRole('button', { name: 'Add to bag' })).not.toBeInTheDocument();
  });

  it('removes a piece', async () => {
    seedGuest([saved('ra-soap', '2026-10-06T00:00:00Z', 1200)]);
    renderRoute('/wishlist');
    await userEvent.click(await main().findByRole('button', { name: 'Remove Cedar and vetiver soap from your wishlist' }));
    expect(main().getByRole('heading', { name: 'Nothing saved yet' })).toBeInTheDocument();
  });
});

describe('wishlist and accounts', () => {
  it('merges a guest wishlist into the account on sign in', async () => {
    const token = await signedInAccount();
    await saveWishlistItem(token, saved('gw-board', '2026-10-01T00:00:00Z', 4400));
    seedGuest([saved('ra-soap', '2026-10-06T00:00:00Z', 1200)]);

    renderRoute('/wishlist');
    await waitFor(() => expect(main().getAllByRole('article')).toHaveLength(2));
    expect(localStorage.getItem(GUEST_WISHLIST_KEY)).toBeNull();
    expect((await getWishlist(token)).map((item) => item.productId)).toEqual(['ra-soap', 'gw-board']);
    expect(main().queryByText(/saved on this device only/i)).not.toBeInTheDocument();
  });

  it('saves to the account while signed in', async () => {
    const token = await signedInAccount();
    renderRoute('/shop/beauty');
    await screen.findByRole('button', { name: /account menu/i });
    await userEvent.click(await screen.findByRole('button', { name: 'Save Camellia face oil to your wishlist' }));
    await waitFor(async () => expect((await getWishlist(token)).map((item) => item.productId)).toEqual(['ra-oil']));
    expect(localStorage.getItem(GUEST_WISHLIST_KEY)).toBeNull();
  });

  it('undoes a change the server refuses', async () => {
    await signedInAccount();
    renderRoute('/shop/beauty');
    await screen.findByRole('button', { name: /account menu/i });
    const heart = await screen.findByRole('button', { name: 'Save Camellia face oil to your wishlist' });

    configureApi({ failureRate: 1 });
    await userEvent.click(heart);
    expect(await screen.findByText("We couldn't update your wishlist")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Camellia face oil to your wishlist' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('empties the shown wishlist on sign out, leaving the account copy alone', async () => {
    const token = await signedInAccount();
    await saveWishlistItem(token, saved('ra-soap', '2026-10-06T00:00:00Z', 1200));
    renderRoute('/');
    expect(await screen.findByRole('link', { name: 'Wishlist, 1 saved' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /account menu/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(screen.getByRole('link', { name: 'Wishlist' })).toBeInTheDocument();
    // The session is gone, but the account's saved list is untouched on the server.
    const stored = JSON.parse(localStorage.getItem(WISHLISTS_KEY)!) as Record<string, WishlistItem[]>;
    expect(Object.values(stored)[0]!.map((item) => item.productId)).toEqual(['ra-soap']);
    await expect(getWishlist(token)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
