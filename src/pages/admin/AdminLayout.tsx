import { Suspense } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation } from 'react-router';
import { Boxes, ChartColumn, ClipboardList, LifeBuoy, MessageCircleQuestion, Palette, ReceiptText, ShieldAlert, Store, Undo2, UsersRound, Warehouse } from 'lucide-react';
import { PageFallback } from '@/components/feedback/PageFallback';
import { HeadingIcon, Spinner } from '@/components/ui';
import { usePageTitle } from '@/hooks/usePageTitle';
import { cx } from '@/lib/cx';
import { useAuth } from '@/state/AuthProvider';
import styles from './Admin.module.css';

const SECTIONS = [
  // `end`, so Overview isn't highlighted on every admin page.
  { to: '/admin', label: 'Overview', icon: ChartColumn, end: true },
  { to: '/admin/orders', label: 'Orders', icon: ReceiptText, end: false },
  { to: '/admin/returns', label: 'Returns', icon: Undo2, end: false },
  { to: '/admin/products', label: 'Products', icon: Boxes, end: false },
  { to: '/admin/inventory', label: 'Inventory', icon: Warehouse, end: false },
  { to: '/admin/purchasing', label: 'Purchasing', icon: ClipboardList, end: false },
  { to: '/admin/customers', label: 'Customers', icon: UsersRound, end: false },
  { to: '/admin/workshops', label: 'Workshops', icon: Palette, end: false },
  { to: '/admin/questions', label: 'Questions', icon: MessageCircleQuestion, end: false },
  { to: '/admin/support', label: 'Support', icon: LifeBuoy, end: false },
];

/** The shop owner's area. Customers get a polite refusal; signed-out visitors go to sign in. */
export function AdminLayout() {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === 'checking') return <Spinner label="Checking your session" />;
  if (status === 'signed-out' || !user) {
    return <Navigate to={`/account/sign-in?next=${encodeURIComponent(location.pathname)}`} replace />;
  }
  if (user.role !== 'admin') return <NotForYou />;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Tanelt studio</p>
        <h1 className={styles.title}>
          <HeadingIcon icon={Store} badge />
          Admin
        </h1>
      </header>
      <div className={styles.layout}>
        <nav aria-label="Admin" className={styles.nav}>
          {SECTIONS.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => cx(styles.navLink, isActive && styles.navActive)}>
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

function NotForYou() {
  usePageTitle('Not available');
  return (
    <section className={styles.refusal}>
      <ShieldAlert className={styles.refusalIcon} aria-hidden="true" />
      <h1 className={styles.title}>This area is for the Tanelt team</h1>
      <p>Your account doesn't have access to the shop's admin tools.</p>
      <Link to="/">Back to the shop</Link>
    </section>
  );
}
