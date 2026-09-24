import { DEMO_ADMIN } from '@/data/demoAccounts';
import { normalizeEmail, validateEmail, validateName, validateNewPassword } from '@/domain/auth';
import { constantTimeEqual, hashPassword, randomHex } from '@/lib/crypto';
import { readJson, writeJson } from '@/lib/storage';
import { ApiError, simulateRequest, type RequestOptions } from './client';

/*
 * The mock auth server. Users and sessions live in localStorage like the
 * orders do. Passwords are stored only as salted PBKDF2 hashes, failed
 * sign-ins are rate limited per email, and a wrong email and a wrong
 * password get the same answer so accounts can't be discovered.
 */

export const USERS_KEY = 'tanelt:mock-db:users';
export const SESSIONS_KEY = 'tanelt:mock-db:sessions';
export const MAX_FAILED_SIGN_INS = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
export const SESSION_DAYS = { remembered: 30, single: 1 };

export type Role = 'customer' | 'admin';

export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  role: Role;
}

interface StoredUser extends User {
  salt: string;
  passwordHash: string;
}

interface StoredSession {
  token: string;
  userId: string;
  expiresAt: string;
}

export interface AuthResult {
  user: User;
  token: string;
  expiresAt: string;
}

const isArray = (value: unknown): value is unknown[] => Array.isArray(value);
const users = (): StoredUser[] => readJson(USERS_KEY, [], isArray) as StoredUser[];
const sessions = (): StoredSession[] => readJson(SESSIONS_KEY, [], isArray) as StoredSession[];

function publicUser({ id, email, name, createdAt, role }: StoredUser): User {
  return { id, email, name, createdAt, role: role ?? 'customer' };
}

/** The signed-in admin for a token. Anyone else is refused: unknown sessions as 401, customers as 403. */
export function requireAdmin(token: string | null | undefined): User {
  const user = userForToken(token);
  if (!user) throw new ApiError('UNAUTHORIZED', 'Your session has ended. Sign in again.');
  if (user.role !== 'admin') throw new ApiError('FORBIDDEN', 'This area is for the Tanelt team.');
  return user;
}

/** Creates the demo admin the first time someone signs in as it. */
async function ensureDemoAdmin(email: string): Promise<void> {
  if (email !== DEMO_ADMIN.email || users().some((user) => user.email === email)) return;
  const salt = randomHex(16);
  const admin: StoredUser = {
    id: `usr_${randomHex(8)}`,
    email,
    name: DEMO_ADMIN.name,
    createdAt: new Date().toISOString(),
    role: 'admin',
    salt,
    passwordHash: await hashPassword(DEMO_ADMIN.password, salt),
  };
  writeJson(USERS_KEY, [...users(), admin]);
}

function startSession(user: StoredUser, remember: boolean): AuthResult {
  const now = Date.now();
  const session: StoredSession = {
    token: randomHex(32),
    userId: user.id,
    expiresAt: new Date(now + (remember ? SESSION_DAYS.remembered : SESSION_DAYS.single) * DAY_MS).toISOString(),
  };
  // Drop expired sessions while we're here.
  const live = sessions().filter((existing) => new Date(existing.expiresAt).getTime() > now);
  writeJson(SESSIONS_KEY, [...live, session]);
  return { user: publicUser(user), token: session.token, expiresAt: session.expiresAt };
}

/** The signed-in user for a token, or undefined if it is unknown or expired. Server-side use only. */
export function userForToken(token: string | null | undefined): User | undefined {
  if (!token) return undefined;
  const session = sessions().find((candidate) => candidate.token === token);
  if (!session || new Date(session.expiresAt).getTime() <= Date.now()) return undefined;
  const user = users().find((candidate) => candidate.id === session.userId);
  return user ? publicUser(user) : undefined;
}

/** An account by its id, for server code that needs to reach a shopper (say, to email them). */
export function findUser(userId: string): User | undefined {
  const user = users().find((candidate) => candidate.id === userId);
  return user ? publicUser(user) : undefined;
}

/** Every account, without passwords, for server code that reports on customers. */
export function listUsers(): User[] {
  return users().map(publicUser);
}

/** Recent failed sign-ins per email, oldest first. */
const failures = new Map<string, number[]>();

function recentFailures(email: string): number[] {
  const cutoff = Date.now() - LOCKOUT_MS;
  const recent = (failures.get(email) ?? []).filter((time) => time > cutoff);
  failures.set(email, recent);
  return recent;
}

export interface SignUpInput {
  name: string;
  email: string;
  password: string;
  remember: boolean;
}

export function signUp(input: SignUpInput, options?: RequestOptions): Promise<AuthResult> {
  return simulateRequest(async () => {
    const email = normalizeEmail(input.email);
    const problem = validateName(input.name) ?? validateEmail(email) ?? validateNewPassword(input.password, email);
    if (problem) throw new ApiError('VALIDATION', problem);
    if (users().some((user) => user.email === email)) {
      throw new ApiError('CONFLICT', 'An account with that email already exists. Sign in instead.');
    }
    const salt = randomHex(16);
    const user: StoredUser = {
      id: `usr_${randomHex(8)}`,
      email,
      name: input.name.trim().replace(/\s+/g, ' '),
      createdAt: new Date().toISOString(),
      role: 'customer',
      salt,
      passwordHash: await hashPassword(input.password, salt),
    };
    writeJson(USERS_KEY, [...users(), user]);
    return startSession(user, input.remember);
  }, options);
}

export interface SignInInput {
  email: string;
  password: string;
  remember: boolean;
}

/** A fixed salt for unknown emails, so a missing account takes as long to reject as a wrong password. */
const DECOY_SALT = '00000000000000000000000000000000';

export function signIn(input: SignInInput, options?: RequestOptions): Promise<AuthResult> {
  return simulateRequest(async () => {
    const email = normalizeEmail(input.email);
    if (recentFailures(email).length >= MAX_FAILED_SIGN_INS) {
      throw new ApiError('RATE_LIMITED', 'Too many attempts. Wait 15 minutes, then try again.');
    }
    await ensureDemoAdmin(email);
    const user = users().find((candidate) => candidate.email === email);
    const hash = await hashPassword(input.password, user?.salt ?? DECOY_SALT);
    if (!user || !constantTimeEqual(hash, user.passwordHash)) {
      failures.set(email, [...recentFailures(email), Date.now()]);
      throw new ApiError('UNAUTHORIZED', "That email and password don't match. Try again, or create an account.");
    }
    failures.delete(email);
    return startSession(user, input.remember);
  }, options);
}

export function getSession(token: string, options?: RequestOptions): Promise<User> {
  return simulateRequest(() => {
    const user = userForToken(token);
    if (!user) throw new ApiError('UNAUTHORIZED', 'Your session has ended. Sign in again.');
    return user;
  }, options);
}

export function signOut(token: string, options?: RequestOptions): Promise<void> {
  return simulateRequest(() => {
    writeJson(
      SESSIONS_KEY,
      sessions().filter((session) => session.token !== token),
    );
  }, options);
}

/** Forgets failed sign-in counts. Tests call this between cases. */
export function resetAuthServer(): void {
  failures.clear();
}
