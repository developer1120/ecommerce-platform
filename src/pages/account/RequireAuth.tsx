import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { Spinner } from '@/components/ui';
import { useAuth } from '@/state/AuthProvider';

/** Shows its children to signed-in shoppers; everyone else is sent to sign in and brought back. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'checking') return <Spinner label="Checking your session" />;
  if (status === 'signed-out') {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/account/sign-in?next=${next}`} replace />;
  }
  return <>{children}</>;
}
