import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { signUp } from '@/api/authApi';
import { loadOrders } from '@/api/mockDb';
import { CATALOG } from '@/data/catalog';
import { cartReducer, EMPTY_CART, makeCartLine } from '@/domain/cart';
import { saveCart } from '@/domain/cartStorage';
import { SESSION_TOKEN_KEY } from '@/state/AuthProvider';
import { CHECKOUT_STORAGE_KEY } from '@/state/CheckoutProvider';
import { renderRoute } from '@/test/renderRoute';

const PASSWORD = 'slow mornings with tea';
const main = () => within(screen.getByRole('main'));

async function existingAccount() {
  const result = await signUp({ name: 'Ada Lovelace', email: 'ada@example.com', password: PASSWORD, remember: true });
  // Start each test signed out, with only the account on the server.
  localStorage.removeItem(SESSION_TOKEN_KEY);
  return result;
}

async function fillSignIn(email: string, password: string) {
  await userEvent.type(main().getByRole('textbox', { name: 'Email' }), email);
  await userEvent.type(main().getByLabelText('Password'), password);
}

describe('sign in', () => {
  it('signs in, greets the shopper and returns to where they were', async () => {
    await existingAccount();
    const { router } = renderRoute('/account/sign-in?next=%2Fcart');
    await fillSignIn('ada@example.com', PASSWORD);
    await userEvent.click(main().getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/cart'));
    expect(screen.getByRole('region', { name: 'Notifications' })).toHaveTextContent('Welcome back, Ada');
    expect(screen.getByRole('button', { name: 'Account menu for Ada Lovelace' })).toHaveTextContent('AL');
  });

  it('keeps the session for the tab only, unless asked to remember', async () => {
    await existingAccount();
    renderRoute('/account/sign-in');
    await fillSignIn('ada@example.com', PASSWORD);
    await userEvent.click(main().getByRole('button', { name: 'Sign in' }));
    await screen.findByRole('button', { name: /account menu/i });
    expect(sessionStorage.getItem(SESSION_TOKEN_KEY)).not.toBeNull();
    expect(localStorage.getItem(SESSION_TOKEN_KEY)).toBeNull();
  });

  it('remembers the session when asked', async () => {
    await existingAccount();
    renderRoute('/account/sign-in');
    await fillSignIn('ada@example.com', PASSWORD);
    await userEvent.click(main().getByRole('checkbox', { name: /keep me signed in/i }));
    await userEvent.click(main().getByRole('button', { name: 'Sign in' }));
    await screen.findByRole('button', { name: /account menu/i });
    expect(localStorage.getItem(SESSION_TOKEN_KEY)).not.toBeNull();
  });

  it('explains a wrong password and clears the field', async () => {
    await existingAccount();
    renderRoute('/account/sign-in');
    await fillSignIn('ada@example.com', 'not the password');
    await userEvent.click(main().getByRole('button', { name: 'Sign in' }));
    expect(await main().findByRole('alert')).toHaveTextContent("That email and password don't match");
    expect(main().getByLabelText('Password')).toHaveValue('');
  });

  it('checks the fields before asking the server', async () => {
    renderRoute('/account/sign-in');
    await userEvent.click(main().getByRole('button', { name: 'Sign in' }));
    expect(main().getByRole('textbox', { name: 'Email' })).toHaveAccessibleDescription('Enter your email address');
    expect(main().getByLabelText('Password')).toHaveAccessibleDescription('Enter your password');
  });

  it('shows and hides the password', async () => {
    renderRoute('/account/sign-in');
    const field = main().getByLabelText('Password');
    expect(field).toHaveAttribute('type', 'password');
    await userEvent.click(main().getByRole('button', { name: 'Show password' }));
    expect(field).toHaveAttribute('type', 'text');
    expect(main().getByRole('button', { name: 'Hide password' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('ignores a redirect to another site', async () => {
    await existingAccount();
    const { router } = renderRoute('/account/sign-in?next=https%3A%2F%2Fevil.example');
    await fillSignIn('ada@example.com', PASSWORD);
    await userEvent.click(main().getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });
});

describe('sign up', () => {
  it('creates an account and signs in', async () => {
    const { router } = renderRoute('/account/sign-up');
    await userEvent.type(main().getByRole('textbox', { name: 'Your name' }), 'Grace Hopper');
    await userEvent.type(main().getByRole('textbox', { name: 'Email' }), 'grace@example.com');
    await userEvent.type(main().getByLabelText('Password'), 'debugging the moth');
    expect(main().getByText(/password strength/i)).toHaveTextContent('Strong');
    await userEvent.click(main().getByRole('button', { name: 'Create account' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(screen.getByRole('region', { name: 'Notifications' })).toHaveTextContent('Welcome to Tanelt, Grace');
    expect(screen.getByRole('button', { name: 'Account menu for Grace Hopper' })).toBeInTheDocument();
  });

  it('rejects a weak password before sending anything', async () => {
    renderRoute('/account/sign-up');
    await userEvent.type(main().getByRole('textbox', { name: 'Your name' }), 'Grace Hopper');
    await userEvent.type(main().getByRole('textbox', { name: 'Email' }), 'grace@example.com');
