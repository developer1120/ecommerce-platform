import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CATALOG } from '@/data/catalog';
import { cartReducer, EMPTY_CART, makeCartLine } from '@/domain/cart';
import { saveCart } from '@/domain/cartStorage';
import { loadRecentlyViewed, recordView, RECENTLY_VIEWED_KEY } from '@/domain/recentlyViewed';
import { renderRoute } from '@/test/renderRoute';

const region = (name: string) => screen.findByRole('region', { name });

describe('recently viewed', () => {
  it('records the products a shopper opens', async () => {
    const first = renderRoute('/product/rose-clay-mask');
    await screen.findByRole('heading', { level: 1, name: 'Rose clay mask' });
    first.unmount();
    renderRoute('/product/oak-serving-board');
    await screen.findByRole('heading', { level: 1, name: 'Oak serving board' });
    await waitFor(() => expect(loadRecentlyViewed()).toEqual(['gw-board', 'ra-mask']));
  });

  it('shows the others on a product page, but not the one on screen', async () => {
    recordView('ra-mask');
    recordView('gw-board');
    renderRoute('/product/oak-serving-board');
    const rail = await region('Recently viewed');
    const names = (await within(rail).findAllByRole('heading', { level: 3 })).map((heading) => heading.textContent);
    expect(names).toEqual(['Rose clay mask']);
  });

  it('appears on the home page, newest first, and can be cleared', async () => {
    recordView('ra-mask');
    recordView('gw-board');
    renderRoute('/');
    const rail = await region('Recently viewed');
    const names = (await within(rail).findAllByRole('heading', { level: 3 })).map((heading) => heading.textContent);
    expect(names).toEqual(['Oak serving board', 'Rose clay mask']);

    await userEvent.click(within(rail).getByRole('button', { name: 'Clear' }));
    expect(screen.queryByRole('region', { name: 'Recently viewed' })).not.toBeInTheDocument();
    expect(localStorage.getItem(RECENTLY_VIEWED_KEY)).toBeNull();
  });

  it('stays out of the way for a first-time visitor', async () => {
    renderRoute('/');
    await screen.findAllByRole('article');
    expect(screen.queryByRole('region', { name: 'Recently viewed' })).not.toBeInTheDocument();
  });
});

describe('recommendations', () => {
  it('suggests similar products on a product page', async () => {
    renderRoute('/product/stoneware-mug-set');
    const rail = await region('You may also like');
    const cards = await within(rail).findAllByRole('article');
    expect(cards).toHaveLength(4);
    expect(cards.map((card) => within(card).getByRole('heading').textContent)).not.toContain('Stoneware mug set');
  });

  it('suggests products that pair with the bag, leaving out what is already in it', async () => {
    const mug = CATALOG.find((p) => p.slug === 'stoneware-mug-set')!;
    saveCart(cartReducer(EMPTY_CART, { type: 'add', line: makeCartLine(mug, mug.variants[0]!), quantity: 1 }));
    renderRoute('/cart');
    const rail = await region('Pairs well with your bag');
    const names = (await within(rail).findAllByRole('heading', { level: 3 })).map((heading) => heading.textContent);
    expect(names).toHaveLength(4);
    expect(names).not.toContain('Stoneware mug set');
  });
});
