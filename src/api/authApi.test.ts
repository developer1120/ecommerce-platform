import {
  initials,
  passwordStrength,
  safeRedirect,
  splitName,
  validateEmail,
  validateNewPassword,
} from '@/domain/auth';
import { constantTimeEqual, hashPassword, randomHex } from '@/lib/crypto';
import { getSession, MAX_FAILED_SIGN_INS, SESSIONS_KEY, signIn, signOut, signUp, USERS_KEY, userForToken } from './authApi';

const PASSWORD = 'slow mornings with tea';
const ada = { name: 'Ada Lovelace', email: 'Ada@Example.com', password: PASSWORD, remember: true };

describe('account rules', () => {
  it('checks email format', () => {
    expect(validateEmail('')).toBe('Enter your email address');
    expect(validateEmail('ada@')).toBe('Enter an email address like name@example.com');
    expect(validateEmail(' Ada@Example.com ')).toBeUndefined();
  });

  it('asks for a long, uncommon password that avoids the email', () => {
    expect(validateNewPassword('')).toBe('Create a password');
    expect(validateNewPassword('short')).toBe('Use at least 10 characters');
    expect(validateNewPassword('Password123')).toMatch(/too common/);
    expect(validateNewPassword('zzzzzzzzzzzz')).toBe('Avoid repeating one character');
    expect(validateNewPassword('lovelace-rules', 'lovelace@example.com')).toBe("Don't include your email in your password");
    expect(validateNewPassword(PASSWORD, 'ada@example.com')).toBeUndefined();
  });

  it('grades strength mostly by length', () => {
    expect(passwordStrength('short')).toBe('weak');
    expect(passwordStrength('plainwords')).toBe('fair');
    expect(passwordStrength('Mixed-Case-42')).toBe('strong');
    expect(passwordStrength(PASSWORD)).toBe('strong');
  });

  it('splits names and makes initials', () => {
    expect(splitName('  Ada  King Lovelace ')).toEqual({ firstName: 'Ada', lastName: 'King Lovelace' });
    expect(initials('Ada King Lovelace')).toBe('AL');
    expect(initials('Cher')).toBe('C');
  });

  it('only redirects within the site', () => {
    expect(safeRedirect('/cart')).toBe('/cart');
    expect(safeRedirect('/product/oak?variant=x')).toBe('/product/oak?variant=x');
    expect(safeRedirect('https://evil.example')).toBe('/');
    expect(safeRedirect('//evil.example')).toBe('/');
    expect(safeRedirect('/\\evil.example')).toBe('/');
    expect(safeRedirect('/account/sign-in?next=/cart')).toBe('/');
    expect(safeRedirect(null, '/checkout')).toBe('/checkout');
  });
});

describe('crypto helpers', () => {
  it('hashes deterministically per salt and never returns the password', async () => {
    const salt = randomHex(16);
    const first = await hashPassword(PASSWORD, salt);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashPassword(PASSWORD, salt)).toBe(first);
    expect(await hashPassword(PASSWORD, randomHex(16))).not.toBe(first);
    expect(first).not.toContain('tea');
  });

  it('compares strings without short-circuiting', () => {
    expect(constantTimeEqual('abcd', 'abcd')).toBe(true);
    expect(constantTimeEqual('abcd', 'abce')).toBe(false);
    expect(constantTimeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('mock auth server', () => {
  it('creates an account with a hashed password and opens a session', async () => {
    const result = await signUp(ada);
    expect(result.user).toMatchObject({ name: 'Ada Lovelace', email: 'ada@example.com' });
    expect(result.token).toMatch(/^[0-9a-f]{64}$/);

    const stored = localStorage.getItem(USERS_KEY)!;
    expect(stored).not.toContain(PASSWORD);
    expect(JSON.parse(stored)[0]).toMatchObject({ salt: expect.stringMatching(/^[0-9a-f]{32}$/), passwordHash: expect.any(String) });
    await expect(getSession(result.token)).resolves.toMatchObject({ email: 'ada@example.com' });
  });

  it('refuses a second account for the same email, in any case', async () => {
    await signUp(ada);
    await expect(signUp({ ...ada, email: 'ADA@example.com' })).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'An account with that email already exists. Sign in instead.',
    });
  });

  it('validates on the server too', async () => {
    await expect(signUp({ ...ada, password: 'password123' })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(signUp({ ...ada, name: ' ' })).rejects.toMatchObject({ code: 'VALIDATION', message: 'Enter your name' });
  });

  it('signs in with the right password only, giving the same answer for unknown emails', async () => {
    await signUp(ada);
    await expect(signIn({ email: 'ada@example.com', password: PASSWORD, remember: false })).resolves.toMatchObject({
      user: { name: 'Ada Lovelace' },
    });

    const wrongPassword = await signIn({ email: 'ada@example.com', password: 'not it at all', remember: false }).catch((e: unknown) => e);
    const unknownEmail = await signIn({ email: 'nobody@example.com', password: PASSWORD, remember: false }).catch((e: unknown) => e);
    expect(wrongPassword).toMatchObject({ code: 'UNAUTHORIZED' });
    expect(unknownEmail).toMatchObject({ code: 'UNAUTHORIZED', message: (wrongPassword as Error).message });
  });

  it(`locks an email after ${MAX_FAILED_SIGN_INS} failed attempts for 15 minutes`, async () => {
    await signUp(ada);
    for (let i = 0; i < MAX_FAILED_SIGN_INS; i++) {
      await signIn({ email: 'ada@example.com', password: 'wrong guess here', remember: false }).catch(() => undefined);
    }
    await expect(signIn({ email: 'ada@example.com', password: PASSWORD, remember: false })).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      status: 429,
    });

    vi.setSystemTime(new Date(Date.now() + 16 * 60 * 1000));
    await expect(signIn({ email: 'ada@example.com', password: PASSWORD, remember: false })).resolves.toBeDefined();
  });

  it('expires sessions: a day without "remember", thirty with it', async () => {
    const short = await signUp({ ...ada, remember: false });
    const long = await signIn({ email: 'ada@example.com', password: PASSWORD, remember: true });

    vi.setSystemTime(new Date(Date.now() + 2 * 24 * 60 * 60 * 1000));
    expect(userForToken(short.token)).toBeUndefined();
    expect(userForToken(long.token)).toMatchObject({ email: 'ada@example.com' });
    await expect(getSession(short.token)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('ends a session on sign out', async () => {
    const { token } = await signUp(ada);
    await signOut(token);
    expect(userForToken(token)).toBeUndefined();
    expect(JSON.parse(localStorage.getItem(SESSIONS_KEY)!)).toEqual([]);
  });
});
