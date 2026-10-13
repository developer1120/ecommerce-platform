import { NavLink, useLocation } from 'react-router';
import { Heart, House, LayoutGrid, Search, UserRound } from 'lucide-react';
import { cx } from '@/lib/cx';
import { useAuth } from '@/state/AuthProvider';
import { useWishlist } from '@/state/WishlistProvider';
import styles from './BottomNav.module.css';

/**
 * Thumb-reach shortcuts along the bottom of a phone screen: the places the
 * collapsed header has no room for. Checkout hides it, to keep that flow
 * free of ways out.
 */
export function BottomNav() {
  const { status } = useAuth();
  const { count } = useWishlist();
  const location = useLocation();
  if (location.pathname.startsWith('/checkout')) return null;

  const signedIn = status === 'signed-in';
  const here = `${location.pathname}${location.search}`;
  const signInTo = here.startsWith('/account/sign-') || here === '/' ? '/account/sign-in' : `/account/sign-in?next=${encodeURIComponent(here)}`;
  const link = ({ isActive }: { isActive: boolean }) => cx(styles.link, isActive && styles.active);

  return (
    <>
      {/* Keeps the end of the page clear of the fixed bar. */}
      <div className={styles.spacer} aria-hidden="true" />
      <nav className={styles.bar} aria-label="Shortcuts">
        <NavLink to="/" end className={link}>
          <House aria-hidden="true" />
          Home
        </NavLink>
        <NavLink to="/shop" className={link}>
          <LayoutGrid aria-hidden="true" />
          Shop
        </NavLink>
        <NavLink to="/search" className={link}>
          <Search aria-hidden="true" />
          Search
        </NavLink>
        <NavLink to="/wishlist" className={link} aria-label={count > 0 ? `Saved, ${count} ${count === 1 ? 'item' : 'items'}` : undefined}>
          <span className={styles.iconWrap}>
            <Heart aria-hidden="true" />
            {count > 0 && (
              <span className={styles.badge} aria-hidden="true">
                {count > 99 ? '99+' : count}
              </span>
            )}
          </span>
          Saved
        </NavLink>
        {signedIn ? (
          <NavLink to="/account" className={link}>
            <UserRound aria-hidden="true" />
            Account
          </NavLink>
        ) : (
          <NavLink to={signInTo} className={link}>
            <UserRound aria-hidden="true" />
            Sign in
          </NavLink>
        )}
      </nav>
    </>
  );
}
