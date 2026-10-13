import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CATALOG } from '@/data/catalog';
import { makeCartLine } from '@/domain/cart';
import { saveCart } from '@/domain/cartStorage';
import { COMPARE_STORAGE_KEY, toCompareItem } from '@/domain/compare';
import { axeViolations } from '@/test/axe';
import { renderRoute } from '@/test/renderRoute';

const bySlug = (slug: string) => CATALOG.find((product) => product.slug === slug)!;
const shirt = bySlug('relaxed-linen-shirt');
const beanie = bySlug('ribbed-wool-beanie');
const soap = bySlug('cedar-and-vetiver-soap');
const throwBlanket = bySlug('washed-linen-throw');

function pick(...products: (typeof shirt)[]) {
  localStorage.setItem(COMPARE_STORAGE_KEY, JSON.stringify(products.map(toCompareItem)));
}

const main = () => within(screen.getByRole('main'));
const tray = () => screen.getByRole('complementary', { name: 'Compare' });
const table = () => main().getByRole('table');
const columns = () => within(table()).getAllByRole('columnheader').map((header) => within(header).getByRole('link').textContent);
const rowLabels = () => within(table()).getAllByRole('rowheader').map((header) => header.textContent);

describe('picking products to compare', () => {
  it('collects products from cards into the tray', async () => {
    const user = userEvent.setup();
    renderRoute('/shop/apparel');
    await main().findAllByRole('article');
    expect(screen.queryByRole('complementary', { name: 'Compare' })).not.toBeInTheDocument();

    await user.click(main().getByRole('button', { name: `Add ${shirt.name} to compare` }));
    expect(within(tray()).getByText(shirt.name)).toBeInTheDocument();
    expect(within(tray()).getByText('Pick one more to compare')).toBeInTheDocument();
    expect(main().getByRole('button', { name: `Remove ${shirt.name} from compare` })).toHaveAttribute('aria-pressed', 'true');

    await user.click(main().getByRole('button', { name: `Add ${beanie.name} to compare` }));
    const go = within(tray()).getByRole('link', { name: /Compare \(2\)/ });
    expect(go).toHaveAttribute('href', `/compare?ids=${shirt.id},${beanie.id}`);
    await waitFor(() => expect(JSON.parse(localStorage.getItem(COMPARE_STORAGE_KEY)!)).toHaveLength(2));
  });

  it('stops at four, and says why', async () => {
    const user = userEvent.setup();
    const four = CATALOG.filter((product) => product.department === 'home').slice(0, 4);
    pick(...four);
    renderRoute('/shop/home');
    await main().findAllByRole('article');
    const fifth = CATALOG.find((product) => product.department === 'home' && !four.includes(product))!;
    await user.click(main().getByRole('button', { name: `Add ${fifth.name} to compare` }));

    expect(await screen.findByText('You can compare up to 4 products')).toBeInTheDocument();
    expect(within(tray()).queryByText(fifth.name)).not.toBeInTheDocument();
    expect(within(tray()).getByRole('link', { name: /Compare \(4\)/ })).toBeInTheDocument();
  });

  it('takes items out of the tray, or clears it', async () => {
    const user = userEvent.setup();
    pick(shirt, beanie, soap);
    renderRoute('/');
    await user.click(within(tray()).getByRole('button', { name: `Remove ${beanie.name} from compare` }));
    expect(within(tray()).queryByText(beanie.name)).not.toBeInTheDocument();
    expect(within(tray()).getByRole('link', { name: /Compare \(2\)/ })).toBeInTheDocument();

    await user.click(within(tray()).getByRole('button', { name: 'Clear' }));
    expect(screen.queryByRole('complementary', { name: 'Compare' })).not.toBeInTheDocument();
  });

  it('can be picked from the product page too', async () => {
    const user = userEvent.setup();
    renderRoute(`/product/${throwBlanket.slug}`);
    await user.click(await main().findByRole('button', { name: `Add ${throwBlanket.name} to compare` }));
    expect(within(tray()).getByText(throwBlanket.name)).toBeInTheDocument();
  });

  it('stays out of checkout', async () => {
    pick(shirt, beanie);
    saveCart({ lines: [{ ...makeCartLine(soap, soap.variants[0]!), quantity: 1 }] });
    const { router } = renderRoute('/cart');
    expect(tray()).toBeInTheDocument();
    await router.navigate('/checkout');
    expect(await main().findByRole('heading', { name: /Contact and shipping/ })).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'Compare' })).not.toBeInTheDocument();
  });
});

describe('the comparison page', () => {
  it('lays the products out side by side, with every row labelled', async () => {
    const user = userEvent.setup();
    pick(shirt, beanie);
    const { router } = renderRoute('/');
    await user.click(within(tray()).getByRole('link', { name: /Compare \(2\)/ }));

    expect(router.state.location.pathname).toBe('/compare');
    expect(await main().findByRole('heading', { level: 1, name: 'Compare' })).toBeInTheDocument();
    await waitFor(() => expect(columns()).toEqual([shirt.name, beanie.name]));
    expect(rowLabels()).toEqual(expect.arrayContaining(['Price', 'Rating', 'Maker', 'Department', 'Type', 'Availability', 'Details']));
    expect(screen.queryByRole('complementary', { name: 'Compare' })).not.toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('Compare · Tanelt'));
  });

  it('hides the rows that are the same for everything', async () => {
    const user = userEvent.setup();
    pick(shirt, beanie);
    renderRoute('/compare');
    await waitFor(() => expect(rowLabels()).toContain('Department'));
    await user.click(main().getByRole('checkbox', { name: 'Show only differences' }));
    expect(rowLabels()).not.toContain('Department');
    expect(rowLabels()).toContain('Price');
  });

  it('marks the lowest price and the best rating', async () => {
    pick(throwBlanket, soap);
    renderRoute('/compare');
    await waitFor(() => expect(columns()).toHaveLength(2));
    const headers = within(table()).getAllByRole('columnheader');
    expect(headers[1]).toHaveTextContent('Lowest price');
    expect(headers[0]).not.toHaveTextContent('Lowest price');
  });

  it('opens a shared link as the shopper\'s own comparison', async () => {
    pick(soap);
    renderRoute(`/compare?ids=${throwBlanket.id},nope,${shirt.id}`);
    await waitFor(() => expect(columns()).toEqual([throwBlanket.name, shirt.name]));
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem(COMPARE_STORAGE_KEY)!).map((entry: { id: string }) => entry.id)).toEqual([throwBlanket.id, shirt.id]),
    );
  });

  it('removes a column from the page and from the address', async () => {
    const user = userEvent.setup();
    const { router } = renderRoute(`/compare?ids=${shirt.id},${beanie.id},${soap.id}`);
    await waitFor(() => expect(columns()).toHaveLength(3));
    await user.click(main().getByRole('button', { name: `Remove ${beanie.name}` }));
    await waitFor(() => expect(columns()).toEqual([shirt.name, soap.name]));
    expect(router.state.location.search).toBe(`?ids=${shirt.id},${soap.id}`);
  });

  it('explains what to do when there is nothing to compare', async () => {
    renderRoute('/compare');
    expect(await main().findByRole('heading', { name: 'Nothing to compare yet' })).toBeInTheDocument();
    expect(main().getByRole('link', { name: 'Browse the shop' })).toHaveAttribute('href', '/shop');
  });

  it('is accessible', async () => {
    pick(shirt, beanie, soap);
    renderRoute('/compare');
    await waitFor(() => expect(columns()).toHaveLength(3));
    expect(await axeViolations()).toEqual([]);
  });
});
