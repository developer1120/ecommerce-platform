import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { LayoutDashboard, LogOut, Package, User as UserIcon, UserRound } from 'lucide-react';
import { preloadAccount, preloadAdmin } from '@/app/lazyPages';
import { initials } from '@/domain/auth';
import { cx } from '@/lib/cx';
import { useAuth } from '@/state/AuthProvider';
import { useToast } from '@/state/ToastProvider';
import styles from './AccountMenu.module.css';

/**
 * Signed out: a link to sign in that comes back here afterwards.
 * Signed in: the shopper's initials, opening a small menu.
 */
export function AccountMenu({ className }: { className?: string }) {
  const { status, user, signOut } = useAuth();
  const { toast } = useToast();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  // Opening the menu says where they're heading next; start loading that code.
  const isAdmin = user?.role === 'admin';
  useEffect(() => {
    if (!open) return;
    void preloadAccount();
    if (isAdmin) void preloadAdmin();
  }, [open, isAdmin]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (status !== 'signed-in' || !user) {
    const here = `${location.pathname}${location.search}`;
    const next = here.startsWith('/account/sign-') ? '' : `?next=${encodeURIComponent(here)}`;
    return (
      <Link to={`/account/sign-in${next}`} className={cx(styles.iconLink, className)} aria-label="Sign in">
        <UserIcon aria-hidden="true" />
      </Link>
    );
  }

  return (
    <div ref={rootRef} className={cx(styles.root, className)}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.avatar}
        aria-label={`Account menu for ${user.name}`}
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
      >
        {initials(user.name)}
      </button>
      {open && (
        <div id={menuId} className={styles.menu}>
          <p className={styles.who}>
            Signed in as
            <strong>{user.email}</strong>
          </p>
          <Link to="/account/orders" className={styles.item}>
            <Package aria-hidden="true" /> Your orders
          </Link>
          <Link to="/account/details" className={styles.item}>
            <UserRound aria-hidden="true" /> Your details
          </Link>
          {user.role === 'admin' && (
            <Link to="/admin" className={styles.item}>
              <LayoutDashboard aria-hidden="true" /> Admin
            </Link>
          )}
          <button
            type="button"
            className={styles.item}
            onClick={async () => {
              setOpen(false);
              await signOut();
              toast({ tone: 'info', title: 'You are signed out' });
            }}
          >
            <LogOut aria-hidden="true" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
