import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { configureApi } from '@/api/client';
import { renderRoute } from '@/test/renderRoute';

describe('HomePage', () => {
  it('introduces the shop with a hero and calls to action', () => {
    renderRoute('/');
    expect(screen.getByRole('heading', { level: 1, name: 'Objects for slower living' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Shop new arrivals' })).toHaveAttribute('href', '/shop/new');
    expect(screen.getByRole('link', { name: 'Browse everything' })).toHaveAttribute('href', '/shop');
  });

  it('links a tile for each department and the sale', () => {
    renderRoute('/');
    const departments = screen.getByRole('region', { name: 'Shop by department' });
    const links = within(departments).getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/shop/home',
      '/shop/apparel',
      '/shop/beauty',
      '/shop/sale',
    ]);
  });

  it('shows placeholders while loading, then the newest arrivals', async () => {
    renderRoute('/');
    const rail = screen.getByRole('region', { name: 'Just arrived' });
    expect(rail).toHaveAttribute('aria-busy', 'true');

    const cards = await within(rail).findAllByRole('article');
    expect(cards).toHaveLength(4);
    expect(rail).toHaveAttribute('aria-busy', 'false');
    for (const card of cards) expect(card).toHaveTextContent('New');
  });

  it('shows the most-reviewed products that are in stock', async () => {
    renderRoute('/');
    const rail = screen.getByRole('region', { name: 'Most loved' });
    const names = (await within(rail).findAllByRole('heading', { level: 3 })).map((heading) => heading.textContent);
    expect(names).toEqual(['Cedar and vetiver soap', 'Organic cotton tee', 'Rose clay mask', 'Beeswax taper candles']);
  });

  it('opens a product from a card', async () => {
    const { router } = renderRoute('/');
    const rail = screen.getByRole('region', { name: 'Most loved' });
    await userEvent.click(await within(rail).findByRole('link', { name: /cedar and vetiver soap/i }));
    expect(router.state.location.pathname).toBe('/product/cedar-and-vetiver-soap');
  });

  it('keeps the page usable when a rail fails, with a retry', async () => {
    configureApi({ failureRate: 1 });
    renderRoute('/');
    const alerts = await screen.findAllByRole('alert');
    expect(alerts).toHaveLength(2);
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();

    configureApi({ failureRate: 0 });
    const rail = screen.getByRole('region', { name: 'Just arrived' });
    await userEvent.click(within(rail).getByRole('button', { name: 'Try again' }));
    expect(await within(rail).findAllByRole('article')).toHaveLength(4);
  });
});
