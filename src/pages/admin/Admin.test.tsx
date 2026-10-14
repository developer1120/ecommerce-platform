import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { listAdminProducts, saveProduct } from '@/api/adminApi';
import { signIn, signUp } from '@/api/authApi';
import { getProduct, searchProducts } from '@/api/catalogApi';
import { CATALOG_KEY, resetMockServer } from '@/api/mockDb';
import { loadOutbox, subscribeToRestock } from '@/api/stockAlertsApi';
import { CATALOG } from '@/data/catalog';
import { DEMO_ADMIN } from '@/data/demoAccounts';
import { draftFromProduct, EMPTY_DRAFT } from '@/domain/productForm';
import { SESSION_TOKEN_KEY } from '@/state/AuthProvider';
import { renderRoute } from '@/test/renderRoute';

const main = () => within(screen.getByRole('main'));
/** The product price, not the per-option "Price for …" inputs. */
const PRICE = /^Price\*?$/;
const bySlug =(slug: string) => CATALOG.find((product) => product.slug === slug)!;

async function asAdmin() {
  const { token } = await signIn({ email: DEMO_ADMIN.email, password: DEMO_ADMIN.password, remember: true });
  localStorage.setItem(SESSION_TOKEN_KEY, JSON.stringify(token));
  return token;
}

async function asCustomer() {
  const { token } = await signUp({ name: 'Ada Lovelace', email: 'ada@example.com', password: 'slow mornings with tea', remember: true });
  localStorage.setItem(SESSION_TOKEN_KEY, JSON.stringify(token));
  return token;
}

const NEW_DRAFT = {
  ...EMPTY_DRAFT,
  name: 'Ash serving board',
  maker: 'Hollow Kiln',
  type: 'Kitchen',
  summary: 'A long board for bread and cheese.',
  price: '58',
  variants: [{ id: '', options: {}, stock: '6', price: '' }],
};

describe('admin access', () => {
  it('sends a signed-out visitor to sign in', async () => {
    const { router } = renderRoute('/admin/products');
    await waitFor(() => expect(router.state.location.pathname).toBe('/account/sign-in'));
    expect(router.state.location.search).toBe('?next=%2Fadmin%2Fproducts');
  });

  it('turns customers away, on the page and on the server', async () => {
    const token = await asCustomer();
    renderRoute('/admin');
    expect(await main().findByRole('heading', { name: 'This area is for the Tanelt team' })).toBeInTheDocument();
    expect(main().queryByRole('table')).not.toBeInTheDocument();
    await expect(listAdminProducts(token)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(saveProduct(token, null, NEW_DRAFT)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(listAdminProducts('nonsense')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('lets the demo admin sign in and find the admin area from the account menu', async () => {
    const user = userEvent.setup();
    const { router } = renderRoute('/account/sign-in?next=/admin');
    await user.type(main().getByLabelText('Email'), DEMO_ADMIN.email);
    await user.type(main().getByLabelText(/^Password/), DEMO_ADMIN.password);
    await user.click(main().getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin'));
    expect(await main().findByRole('heading', { name: 'Overview' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Account menu for Studio Admin' }));
    expect(screen.getByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/admin');
  });

  it('shows no admin link to customers', async () => {
    const user = userEvent.setup();
    await asCustomer();
    renderRoute('/');
    await user.click(await screen.findByRole('button', { name: 'Account menu for Ada Lovelace' }));
    expect(screen.getByRole('link', { name: 'Your orders' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument();
  });
});

describe('product list', () => {
  it('lists every product and narrows by search and status', async () => {
    const user = userEvent.setup();
    const token = await asAdmin();
    await saveProduct(token, null, NEW_DRAFT);
    renderRoute('/admin/products');

    const rows = () => within(main().getByRole('table')).getAllByRole('row').slice(1);
    await waitFor(() => expect(rows()).toHaveLength(CATALOG.length));
    // Newest edit first, with its status shown.
    expect(rows()[0]).toHaveTextContent('Ash serving board');
    expect(rows()[0]).toHaveTextContent('Draft');
    expect(main().getByText(`${CATALOG.length} of ${CATALOG.length} products`)).toBeInTheDocument();

    await user.click(main().getByRole('button', { name: 'Drafts' }));
    expect(rows()).toHaveLength(1);
    expect(main().getByRole('button', { name: 'Drafts' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(main().getByRole('button', { name: 'All' }));
    await user.type(main().getByLabelText('Search products'), 'boucle');
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toHaveTextContent('Wool bouclé cushion');
    expect(rows()[0]).toHaveTextContent('0 · out');

    await user.clear(main().getByLabelText('Search products'));
    await user.click(main().getByRole('button', { name: 'Low or out of stock' }));
    expect(rows().length).toBeGreaterThan(0);
    for (const row of rows()) expect(row).toHaveTextContent(/· (low|out)/);

    await user.type(main().getByLabelText('Search products'), 'zzzz');
    expect(main().getByText('No products match. Try another search or filter.')).toBeInTheDocument();
  });
});

describe('creating a product', () => {
  it('creates an active product that shoppers can find', async () => {
    const user = userEvent.setup();
    await asAdmin();
    const { router } = renderRoute('/admin/products');
    await user.click(await main().findByRole('link', { name: 'New product' }));
    expect(await main().findByRole('heading', { name: 'New product' })).toBeInTheDocument();

    await user.type(main().getByLabelText(/^Name/), 'Linen apron');
    // The address follows the name until it is edited.
    expect(main().getByLabelText('Web address')).toHaveValue('linen-apron');
    await user.type(main().getByLabelText(/^Maker/), 'Field and Flax');
    await user.type(main().getByLabelText(/^Type/), 'Kitchen');
    await user.selectOptions(main().getByLabelText('Department'), 'apparel');
    await user.type(main().getByLabelText(/^Summary/), 'A cross-back apron in washed linen.');
    await user.type(main().getByLabelText(PRICE), '46');
    await user.type(main().getByLabelText('Options'), 'Color: Oat, Ink');
    await user.clear(main().getByLabelText('Stock for Oat'));
    await user.type(main().getByLabelText('Stock for Oat'), '4');
    await user.clear(main().getByLabelText('Stock for Ink'));
    await user.type(main().getByLabelText('Stock for Ink'), '12');
    await user.selectOptions(main().getByLabelText('Status'), 'active');
    await user.selectOptions(main().getByLabelText('Object'), 'garment');
    await user.click(main().getByRole('button', { name: 'Create product' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/products'));
    expect(await screen.findByText('Linen apron created')).toBeInTheDocument();

    const product = await getProduct('linen-apron');
    expect(product).toMatchObject({ name: 'Linen apron', department: 'apparel', price: 4600, art: { motif: 'garment' } });
    expect(product.variants.map((variant) => [variant.options.Color, variant.stock])).toEqual([
      ['Oat', 4],
      ['Ink', 12],
    ]);
    expect((await searchProducts('apron')).items.map((item) => item.slug)).toContain('linen-apron');
    // Saved with the rest of the mock server, and gone after a reset.
    expect(localStorage.getItem(CATALOG_KEY)).toContain('linen-apron');
    resetMockServer();
    await expect(getProduct('linen-apron')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('keeps drafts and archived products out of the shop', async () => {
    const token = await asAdmin();
    await saveProduct(token, null, NEW_DRAFT);
    await expect(getProduct('ash-serving-board')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await searchProducts('serving board')).items.map((item) => item.slug)).not.toContain('ash-serving-board');

    const cushion = bySlug('wool-boucle-cushion');
    await saveProduct(token, cushion.id, { ...draftFromProduct(cushion), status: 'archived' });
    await expect(getProduct('wool-boucle-cushion')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await searchProducts('boucle')).total).toBe(0);
    expect((await listAdminProducts(token)).map((product) => product.slug)).toEqual(
      expect.arrayContaining(['ash-serving-board', 'wool-boucle-cushion']),
    );
  });

  it('lists every problem and moves focus to the summary', async () => {
    const user = userEvent.setup();
    await asAdmin();
    renderRoute('/admin/products/new');
    const taken = CATALOG[0]!;
    await user.type(await main().findByLabelText(/^Name/), 'Anything');
    await user.clear(main().getByLabelText('Web address'));
    await user.type(main().getByLabelText('Web address'), taken.slug);
    // Edited by hand, so the name no longer drives it.
    await user.type(main().getByLabelText(/^Name/), ' else');
    expect(main().getByLabelText('Web address')).toHaveValue(taken.slug);
    await user.type(main().getByLabelText(PRICE), '40');
    await user.type(main().getByLabelText('Previous price'), '30');
    await user.click(main().getByRole('button', { name: 'Create product' }));

    const summary = await main().findByRole('alert');
    await waitFor(() => expect(summary).toHaveFocus());
    expect(within(summary).getByRole('heading')).toHaveTextContent('There are 5 problems');
    expect(within(summary).getByRole('link', { name: `Another product already uses /product/${taken.slug}` })).toBeInTheDocument();
    expect(main().getByLabelText('Previous price')).toHaveAccessibleDescription(
      'Shows the product as on sale. The previous price must be higher than the price',
    );
    await user.click(within(summary).getByRole('link', { name: 'Enter the maker' }));
    expect(main().getByLabelText(/^Maker/)).toHaveFocus();
    expect(CATALOG.some((product) => product.name === 'Anything else')).toBe(false);
  });
});

describe('editing a product', () => {
  it('changes the price shoppers see', async () => {
    const user = userEvent.setup();
    await asAdmin();
    const mug = CATALOG.find((product) => product.options.length > 0 && product.compareAtPrice === undefined)!;
    const { router } = renderRoute('/admin/products');
    await user.click(await main().findByRole('link', { name: `Edit ${mug.name}` }));
    expect(await main().findByRole('heading', { name: `Edit ${mug.name}` })).toBeInTheDocument();
    expect(main().queryByLabelText('Options')).not.toBeInTheDocument();
    expect(main().getByText(/Options can't change once a product exists/)).toBeInTheDocument();

    await user.clear(main().getByLabelText(PRICE));
    await user.type(main().getByLabelText(PRICE), '99.50');
    await user.click(main().getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/products'));
    expect(await screen.findByText(`${mug.name} saved`)).toBeInTheDocument();
    expect((await getProduct(mug.slug)).price).toBe(9950);
  });

  it('emails waiting shoppers when sold-out stock comes back', async () => {
    const user = userEvent.setup();
    const cushion = bySlug('wool-boucle-cushion');
    await subscribeToRestock(cushion.variants[0]!.id, 'grace@example.com');
    await subscribeToRestock(cushion.variants[0]!.id, 'ada@example.com');
    await asAdmin();
    renderRoute(`/admin/products/${cushion.id}`);

    const stock = await main().findByLabelText('Stock for Single item');
    expect(stock).toHaveValue('0');
    await user.clear(stock);
    await user.type(stock, '9');
    await user.click(main().getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText("2 shoppers were emailed that it's back in stock.")).toBeInTheDocument();
    expect(loadOutbox().map((email) => email.to).sort()).toEqual(['ada@example.com', 'grace@example.com']);
    expect((await getProduct(cushion.slug)).variants[0]!.stock).toBe(9);
  });

  it('says so when the product does not exist', async () => {
    await asAdmin();
    renderRoute('/admin/products/no-such-thing');
    expect(await main().findByText("We couldn't find that product.")).toBeInTheDocument();
  });
});
