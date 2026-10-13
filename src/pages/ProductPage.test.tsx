import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { configureApi } from '@/api/client';
import { CATALOG } from '@/data/catalog';
import { selectedSwatch, stockIfChosen } from '@/domain/product';
import { renderRoute } from '@/test/renderRoute';

const shirt = CATALOG.find((product) => product.slug === 'relaxed-linen-shirt')!;

async function renderProduct(path: string) {
  const view = renderRoute(path);
  await screen.findByRole('heading', { level: 1 });
  return view;
}

describe('ProductPage', () => {
  it('shows the product with its maker, price, rating and title', async () => {
    await renderProduct('/product/rose-clay-mask');
    expect(screen.getByRole('heading', { level: 1, name: 'Rose clay mask' })).toBeInTheDocument();
    expect(screen.getByText('Rosa Apothecary')).toBeInTheDocument();
    expect(screen.getByText('$24.00')).toBeInTheDocument();
    expect(screen.getByText(/rated 4\.6 out of 5/i)).toBeInTheDocument();
    // The title is set in an effect that can land just after the heading appears.
    await waitFor(() => expect(document.title).toBe('Rose clay mask · Tanelt'));
  });

  it('links back to the shop and its department in the breadcrumb', async () => {
    await renderProduct('/product/rose-clay-mask');
    const trail = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(trail).getByRole('link', { name: 'Shop' })).toHaveAttribute('href', '/shop');
    expect(within(trail).getByRole('link', { name: 'Beauty' })).toHaveAttribute('href', '/shop/beauty');
    expect(within(trail).getByText('Rose clay mask')).toHaveAttribute('aria-current', 'page');
  });

  it('starts on the first variant in stock', async () => {
    await renderProduct('/product/beeswax-taper-candles');
    // Plum is sold out, but Ivory comes first anyway.
    expect(screen.getByRole('radio', { name: 'Ivory' })).toBeChecked();
    expect(screen.getByText('SKU SL-TAPER-IVOR')).toBeInTheDocument();
  });

  it('switches variant, updating price, stock, SKU and the URL', async () => {
    const { router } = await renderProduct('/product/oak-serving-board');
    expect(screen.getByText('$44.00')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('radio', { name: 'Large' }));
    expect(screen.getByText('$68.00')).toBeInTheDocument();
    expect(screen.getByText('SKU GW-BOARD-LARG')).toBeInTheDocument();
    expect(router.state.location.search).toBe('?variant=gw-board-larg');
    expect(screen.getByRole('group', { name: 'Size: Large' })).toBeInTheDocument();
  });

  it('replaces the history entry when picking options', async () => {
    const { router } = await renderProduct('/product/oak-serving-board');
    await userEvent.click(screen.getByRole('radio', { name: 'Large' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Small' }));
    expect(router.state.historyAction).toBe('REPLACE');
  });

  it('opens the variant named in the URL', async () => {
    await renderProduct('/product/relaxed-linen-shirt?variant=ff-shirt-ink-l');
    expect(screen.getByRole('radio', { name: 'Ink' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'L' })).toBeChecked();
    expect(screen.getByRole('status')).toHaveTextContent('In stock');
  });

  it('ignores an unknown variant in the URL', async () => {
    await renderProduct('/product/relaxed-linen-shirt?variant=nope');
    expect(screen.getByRole('radio', { name: /^Oat/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /^XS/ })).toBeChecked();
  });

  it('marks values that would be sold out with the current selection', async () => {
    await renderProduct('/product/relaxed-linen-shirt?variant=ff-shirt-sage-s');
    // Sage XS has no stock; Sage S does.
    expect(screen.getByRole('radio', { name: 'XS, sold out' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'S' })).toBeChecked();
  });

  it('warns about low stock and explains a sold-out choice', async () => {
    await renderProduct('/product/relaxed-linen-shirt');
    expect(screen.getByRole('status')).toHaveTextContent('Only 3 left');

    await userEvent.click(screen.getByRole('radio', { name: 'Sage, sold out' }));
    expect(screen.getByRole('status')).toHaveTextContent('Sold out in this option');
  });

  it('says a product without options is sold out', async () => {
    await renderProduct('/product/wool-boucle-cushion');
    expect(within(screen.getByRole('main')).queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Sold out. Check back soon.');
  });

  it('shows the sale price, old price and saving', async () => {
    await renderProduct('/product/stoneware-mug-set');
    expect(screen.getByText('$38.40')).toBeInTheDocument();
    expect(screen.getByText('$48.00').closest('s')).not.toBeNull();
    expect(screen.getByText('Save 20%')).toBeInTheDocument();
  });

  it('moves between gallery views with thumbnails and arrows', async () => {
    await renderProduct('/product/stoneware-mug-set');
    const gallery = screen.getByRole('region', { name: 'Stoneware mug set images' });
    expect(within(gallery).getByText('Front')).toBeInTheDocument();

    await userEvent.click(within(gallery).getByRole('button', { name: 'Show close-up view' }));
    expect(within(gallery).getByText('Close-up')).toBeInTheDocument();
    expect(within(gallery).getByRole('button', { name: 'Show close-up view' })).toHaveAttribute('aria-current', 'true');

    await userEvent.click(within(gallery).getByRole('button', { name: 'Next view' }));
    expect(within(gallery).getByText('Styled')).toBeInTheDocument();
    await userEvent.click(within(gallery).getByRole('button', { name: 'Next view' }));
    expect(within(gallery).getByText('Front')).toBeInTheDocument();

    within(gallery).getByRole('button', { name: 'Show front view' }).focus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(within(gallery).getByText('Styled')).toBeInTheDocument();
  });

  it('paints the drawing in the chosen color', async () => {
    await renderProduct('/product/relaxed-linen-shirt');
    await userEvent.click(screen.getByRole('radio', { name: /^Ink/ }));
    const gallery = screen.getByRole('region', { name: /images/ });
    expect(gallery.querySelector('[fill="#2b1a3a"]')).not.toBeNull();
  });

  it('folds details into sections with the description open', async () => {
    await renderProduct('/product/oak-serving-board');
    const description = screen.getByText('Description').closest('details')!;
    const details = screen.getByText('Details').closest('details')!;
    expect(description).toHaveAttribute('open');
    expect(details).not.toHaveAttribute('open');
    expect(within(details).getByText('Solid oak, food-safe oil finish')).toBeInTheDocument();
  });

  it('explains when a product does not exist', async () => {
    renderRoute('/product/unicorn-saddle');
    expect(await screen.findByRole('heading', { level: 1, name: "We can't find that product" })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See new arrivals' })).toHaveAttribute('href', '/shop/new');
    await waitFor(() => expect(document.title).toBe('Product not found · Tanelt'));
  });

  it('offers a retry when loading fails', async () => {
    configureApi({ failureRate: 1 });
    renderRoute('/product/rose-clay-mask');
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load this product");

    configureApi({ failureRate: 0 });
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Rose clay mask' })).toBeInTheDocument();
  });

  it('is reached from a product card', async () => {
    const { router } = renderRoute('/shop/beauty');
    await userEvent.click(await screen.findByRole('link', { name: /camellia face oil/i }));
    expect(router.state.location.pathname).toBe('/product/camellia-face-oil');
    expect(await screen.findByRole('heading', { level: 1, name: 'Camellia face oil' })).toBeInTheDocument();
  });
});

describe('variant helpers', () => {
  it('reports stock for the variant one option change away', () => {
    expect(stockIfChosen(shirt, { Color: 'Sage', Size: 'S' }, 'Size', 'XS')).toBe(0);
    expect(stockIfChosen(shirt, { Color: 'Sage', Size: 'S' }, 'Color', 'Ink')).toBe(9);
  });

  it('finds the swatch of the selected color', () => {
    const ink = shirt.variants.find((variant) => variant.options.Color === 'Ink')!;
    expect(selectedSwatch(shirt, ink)).toBe('#2b1a3a');
    const board = CATALOG.find((product) => product.slug === 'oak-serving-board')!;
    expect(selectedSwatch(board, board.variants[0]!)).toBeUndefined();
  });
});
