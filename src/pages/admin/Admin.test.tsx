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
