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
    await userEvent.type(main().getByLabelText('Password'), 'password123');
    expect(main().getByText(/password strength/i)).toHaveTextContent('Too weak');
    await userEvent.click(main().getByRole('button', { name: 'Create account' }));
    expect(main().getByLabelText('Password')).toHaveAccessibleDescription(/too common/);
  });

  it('points an existing customer to sign in', async () => {
    await existingAccount();
    renderRoute('/account/sign-up?next=%2Fcheckout');
    await userEvent.type(main().getByRole('textbox', { name: 'Your name' }), 'Ada Lovelace');
    await userEvent.type(main().getByRole('textbox', { name: 'Email' }), 'ada@example.com');
    await userEvent.type(main().getByLabelText('Password'), 'another long phrase');
    await userEvent.click(main().getByRole('button', { name: 'Create account' }));

    const alert = await main().findByRole('alert');
    expect(alert).toHaveTextContent('An account with that email already exists.');
    expect(within(alert).getByRole('link', { name: 'Go to sign in' })).toHaveAttribute('href', '/account/sign-in?next=%2Fcheckout');
  });
});

describe('session in the header', () => {
  it('links to sign in, coming back to the current page', () => {
    renderRoute('/shop/home?type=Decor');
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/account/sign-in?next=%2Fshop%2Fhome%3Ftype%3DDecor',
    );
  });

  it('restores a saved session on load and signs out from the menu', async () => {
    const { token } = await existingAccount();
    localStorage.setItem(SESSION_TOKEN_KEY, JSON.stringify(token));
    renderRoute('/');

    const avatar = await screen.findByRole('button', { name: 'Account menu for Ada Lovelace' });
    await userEvent.click(avatar);
    expect(screen.getByText('ada@example.com')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
    expect(localStorage.getItem(SESSION_TOKEN_KEY)).toBeNull();
  });

  it('forgets a token the server no longer accepts', async () => {
    localStorage.setItem(SESSION_TOKEN_KEY, JSON.stringify('stale-token'));
    renderRoute('/');
    await waitFor(() => expect(localStorage.getItem(SESSION_TOKEN_KEY)).toBeNull());
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('closes the account menu with Escape', async () => {
    const { token } = await existingAccount();
    localStorage.setItem(SESSION_TOKEN_KEY, JSON.stringify(token));
    renderRoute('/');
    const avatar = await screen.findByRole('button', { name: /account menu/i });
    await userEvent.click(avatar);
    await userEvent.keyboard('{Escape}');
    expect(avatar).toHaveAttribute('aria-expanded', 'false');
    expect(avatar).toHaveFocus();
  });

  it('sends a signed-in visitor away from the sign-in page', async () => {
    const { token } = await existingAccount();
    localStorage.setItem(SESSION_TOKEN_KEY, JSON.stringify(token));
    const { router } = renderRoute('/account/sign-in?next=%2Fcart');
    await waitFor(() => expect(router.state.location.pathname).toBe('/cart'));
  });
});

describe('checkout when signed in', () => {
  it('fills in the name and email, and links the order to the account', async () => {
    const { token, user } = await existingAccount();
    localStorage.setItem(SESSION_TOKEN_KEY, JSON.stringify(token));
    const soap = CATALOG.find((product) => product.slug === 'cedar-and-vetiver-soap')!;
    saveCart(cartReducer(EMPTY_CART, { type: 'add', line: makeCartLine(soap, soap.variants[0]!), quantity: 1 }));

    const form = renderRoute('/checkout');
    // The session is still being checked when the form first renders; the fields fill in once it is.
    await waitFor(() => expect(main().getByRole('textbox', { name: /^email/i })).toHaveValue('ada@example.com'));
    expect(main().getByRole('textbox', { name: /^first name/i })).toHaveValue('Ada');
    expect(main().getByRole('textbox', { name: /^last name/i })).toHaveValue('Lovelace');
    form.unmount();

    sessionStorage.setItem(
      CHECKOUT_STORAGE_KEY,
      JSON.stringify({
        address: {
          email: 'ada@example.com',
          firstName: 'Ada',
          lastName: 'Lovelace',
          line1: '12 Analytical Way',
          line2: '',
          city: 'Brooklyn',
          state: 'NY',
          zip: '11201',
          phone: '',
        },
        addressConfirmed: true,
        methodId: 'standard',
        deliveryConfirmed: true,
        card: { brand: 'visa', last4: '4242', expMonth: 4, expYear: 2029, name: 'Ada Lovelace' },
      }),
    );
    renderRoute('/checkout/review');
    await screen.findByRole('button', { name: /account menu/i });
    await userEvent.click(screen.getByRole('button', { name: /^place order/i }));
    await waitFor(() => expect(loadOrders()).toHaveLength(1));
    expect(loadOrders()[0]!.customerId).toBe(user.id);
  });
});
