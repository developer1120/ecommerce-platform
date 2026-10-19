/*
 * Account rules, shared by the forms and the mock server. Password rules
 * follow current NIST guidance: a decent minimum length and a check against
 * common passwords, rather than demanding symbols and capitals.
 */

export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 128;

/** A short list of passwords people pick most; enough to catch the obvious ones. */
const COMMON_PASSWORDS = new Set([
  'password',
  'password1',
  'password12',
  'password123',
  'passw0rd',
  '1234567890',
  '0123456789',
  '12345678910',
  'qwertyuiop',
  'iloveyou12',
  'letmein123',
  'welcome123',
  'abcdefghij',
  'abc1234567',
  'football12',
  'baseball12',
  'sunshine12',
  'princess12',
  'dragon1234',
  'monkey1234',
  'trustno1234',
  'qwerty1234',
  '1q2w3e4r5t',
  'aaaaaaaaaa',
]);

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validateEmail(email: string): string | undefined {
  const value = normalizeEmail(email);
  if (!value) return 'Enter your email address';
  if (!EMAIL_PATTERN.test(value)) return 'Enter an email address like name@example.com';
  return undefined;
}

export function validateName(name: string): string | undefined {
  return name.trim() ? undefined : 'Enter your name';
}

/** Problems with a new password, or undefined if it is acceptable. */
export function validateNewPassword(password: string, email = ''): string | undefined {
  if (!password) return 'Create a password';
  if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters`;
  if (password.length > MAX_PASSWORD_LENGTH) return `Use at most ${MAX_PASSWORD_LENGTH} characters`;
  if (COMMON_PASSWORDS.has(password.toLowerCase())) return 'That password is too common. Try a phrase only you would think of';
  if (/^(.)\1+$/.test(password)) return 'Avoid repeating one character';
  const localPart = normalizeEmail(email).split('@')[0] ?? '';
  if (localPart.length >= 4 && password.toLowerCase().includes(localPart)) return "Don't include your email in your password";
  return undefined;
}

export type PasswordStrength = 'weak' | 'fair' | 'strong';

/**
 * A rough guide shown under the password field: length matters most, and
 * mixing kinds of characters helps a little.
 */
export function passwordStrength(password: string): PasswordStrength {
  if (validateNewPassword(password) !== undefined) return 'weak';
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((pattern) => pattern.test(password)).length;
  if (password.length >= 16 || (password.length >= 12 && kinds >= 3)) return 'strong';
  return 'fair';
}

/** Splits "Ada King Lovelace" into a first name and the rest, for prefilling forms. */
export function splitName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] ?? '', lastName: parts.slice(1).join(' ') };
}

/** Initials for an avatar: "Ada Lovelace" → "AL". */
export function initials(name: string): string {
  const { firstName, lastName } = splitName(name);
  return `${firstName.charAt(0)}${lastName.split(' ').pop()?.charAt(0) ?? ''}`.toUpperCase() || '?';
}

/**
 * Where to go after signing in. Only paths inside this site are allowed, so a
 * crafted link can't bounce the shopper to another site.
 */
export function safeRedirect(next: string | null | undefined, fallback = '/'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback;
  if (next.startsWith('/account/sign-in') || next.startsWith('/account/sign-up')) return fallback;
  return next;
}
