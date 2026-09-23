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
