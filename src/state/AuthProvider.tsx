import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  getSession,
  signIn as apiSignIn,
  signOut as apiSignOut,
  signUp as apiSignUp,
  type AuthResult,
  type SignInInput,
  type SignUpInput,
  type User,
} from '@/api/authApi';
import { isApiError } from '@/api/client';
import { readJson, removeKey, writeJson, type StorageArea } from '@/lib/storage';

/** Where the session token is kept: localStorage when remembered, sessionStorage otherwise. */
export const SESSION_TOKEN_KEY = 'tanelt:session';

const isString = (value: unknown): value is string => typeof value === 'string';

function readToken(): { token: string; area: StorageArea } | null {
  for (const area of ['local', 'session'] as const) {
    const token = readJson<string | null>(SESSION_TOKEN_KEY, null, isString, area);
    if (token) return { token, area };
  }
  return null;
}

function storeToken(token: string, remember: boolean) {
  removeKey(SESSION_TOKEN_KEY, remember ? 'session' : 'local');
  writeJson(SESSION_TOKEN_KEY, token, remember ? 'local' : 'session');
}

function forgetToken() {
  removeKey(SESSION_TOKEN_KEY, 'local');
  removeKey(SESSION_TOKEN_KEY, 'session');
}

export type AuthStatus = 'checking' | 'signed-in' | 'signed-out';

interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  /** The session token, for requests that act on the shopper's behalf. */
  token: string | null;
  signIn: (input: SignInInput) => Promise<User>;
  signUp: (input: SignUpInput) => Promise<User>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [stored] = useState(readToken);
  const [token, setToken] = useState<string | null>(stored?.token ?? null);
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>(stored ? 'checking' : 'signed-out');

  // A saved token is checked with the server before the shopper counts as signed in.
  useEffect(() => {
    if (!stored) return;
    let cancelled = false;
    getSession(stored.token).then(
      (found) => {
        if (cancelled) return;
        setUser(found);
        setStatus('signed-in');
      },
      (error: unknown) => {
        if (cancelled) return;
        // Only a rejected token is forgotten; a network blip keeps it for next time.
        if (isApiError(error) && error.code === 'UNAUTHORIZED') forgetToken();
        setToken(null);
        setStatus('signed-out');
      },
    );
    return () => {
      cancelled = true;
    };
  }, [stored]);

  const begin = useCallback((result: AuthResult, remember: boolean) => {
    storeToken(result.token, remember);
    setToken(result.token);
    setUser(result.user);
    setStatus('signed-in');
    return result.user;
  }, []);

  const signIn = useCallback(async (input: SignInInput) => begin(await apiSignIn(input), input.remember), [begin]);
  const signUp = useCallback(async (input: SignUpInput) => begin(await apiSignUp(input), input.remember), [begin]);

  const signOut = useCallback(async () => {
    const current = token;
    forgetToken();
    setToken(null);
    setUser(null);
    setStatus('signed-out');
    if (current) await apiSignOut(current).catch(() => undefined);
  }, [token]);

  const value = useMemo(
    () => ({ status, user, token, signIn, signUp, signOut }),
    [status, user, token, signIn, signUp, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
