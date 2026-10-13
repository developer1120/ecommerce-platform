import { Suspense } from 'react';
import { NavLink, Outlet } from 'react-router';
import { Hand, MessagesSquare, Package, Palette, Undo2, UserRound } from 'lucide-react';
import { PageFallback } from '@/components/feedback/PageFallback';
import { HeadingIcon } from '@/components/ui';
import { splitName } from '@/domain/auth';
import { cx } from '@/lib/cx';
import { useAuth } from '@/state/AuthProvider';
import { RequireAuth } from './RequireAuth';
import styles from './AccountLayout.module.css';

const LINKS = [
  { to: '/account/orders', label: 'Orders', icon: Package },
  { to: '/account/returns', label: 'Returns', icon: Undo2 },
  { to: '/account/messages', label: 'Messages', icon: MessagesSquare },
  { to: '/account/workshops', label: 'Workshops', icon: Palette },
  { to: '/account/details', label: 'Your details', icon: UserRound },
];

export function AccountLayout() {
  return (
    <RequireAuth>
      <AccountFrame />
    </RequireAuth>
  );
}

function AccountFrame() {
  const { user } = useAuth();
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Your account</p>
        <h1 className={styles.title}>
          <HeadingIcon icon={Hand} badge />
          Hello, {splitName(user!.name).firstName}
        </h1>
      </header>
      <div className={styles.layout}>
        <nav aria-label="Account" className={styles.nav}>
          {LINKS.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => cx(styles.link, isActive && styles.active)}>
              <Icon aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className={styles.content}>
          <Suspense fallback={<PageFallback />}>
            <Outlet />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
