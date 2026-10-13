import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import { Heart, Menu, Moon, Search, ShoppingBag, Sun, X } from 'lucide-react';
import { SearchPanel } from '@/components/search/SearchPanel';
import { IconButton } from '@/components/ui';
import { NAV_CATEGORIES } from '@/config/navigation';
import { cx } from '@/lib/cx';
import { useCartDrawer } from '@/state/CartDrawerProvider';
import { useCart } from '@/state/CartProvider';
import { useWishlist } from '@/state/WishlistProvider';
import iconStyles from '@/components/ui/IconButton.module.css';
import { useTheme } from '@/theme/ThemeProvider';
import { AccountMenu } from './AccountMenu';
import styles from './SiteHeader.module.css';

export function SiteHeader() {
  const { resolved, setPreference } = useTheme();
  const { itemCount } = useCart();
  const { count: wishlistCount } = useWishlist();
  const { open: openBag } = useCartDrawer();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const menuId = useId();
  const searchId = useId();
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const location = useLocation();

  // Following a link closes whatever was open.
  useEffect(() => {
    setMenuOpen(false);
    setSearchOpen(false);
  }, [location.pathname, location.search]);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    searchButtonRef.current?.focus();
  }, []);

  // A click outside the header closes the search panel.
  useEffect(() => {
    if (!searchOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!headerRef.current?.contains(event.target as Node)) setSearchOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [searchOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  const nextTheme = resolved === 'dark' ? 'light' : 'dark';

  return (
    <header ref={headerRef} className={styles.header}>
      <div className={styles.inner}>
        <div className={styles.start}>
          <IconButton
            className={styles.menuButton}
            label={menuOpen ? 'Close menu' : 'Open menu'}
            icon={menuOpen ? <X /> : <Menu />}
            aria-expanded={menuOpen}
            aria-controls={menuId}
            onClick={() => {
              setSearchOpen(false);
              setMenuOpen((open) => !open);
            }}
          />
          <Link to="/" className={styles.logo} aria-label="Tanelt home">
            tanelt<span className={styles.logoDot}>.</span>
          </Link>
        </div>

        <nav className={styles.nav} aria-label="Departments">
          <ul className={styles.navList}>
            {NAV_CATEGORIES.map((category) => (
              <li key={category.slug}>
                <NavLink
                  to={`/shop/${category.slug}`}
                  className={({ isActive }) => cx(styles.navLink, isActive && styles.navLinkActive)}
                  data-highlight={category.highlight || undefined}
                >
                  {category.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className={styles.actions}>
          <IconButton
            ref={searchButtonRef}
            label="Search"
            icon={searchOpen ? <X /> : <Search />}
            aria-expanded={searchOpen}
            aria-controls={searchOpen ? searchId : undefined}
            onClick={() => {
              setMenuOpen(false);
              if (searchOpen) closeSearch();
              else setSearchOpen(true);
            }}
          />
          <IconButton
            label={`Switch to ${nextTheme} theme`}
            icon={resolved === 'dark' ? <Sun /> : <Moon />}
            onClick={() => setPreference(nextTheme)}
            className={styles.hideOnSmall}
          />
          <Link
            to="/wishlist"
            className={cx(iconStyles.iconButton, styles.hideOnSmall)}
            data-variant="ghost"
            aria-label={wishlistCount > 0 ? `Wishlist, ${wishlistCount} saved` : 'Wishlist'}
          >
            <span className={iconStyles.glyph} aria-hidden="true">
              <Heart />
            </span>
            {wishlistCount > 0 && (
              <span className={iconStyles.count} aria-hidden="true">
                {wishlistCount > 99 ? '99+' : wishlistCount}
              </span>
            )}
          </Link>
          <AccountMenu className={styles.hideOnSmall} />
          <IconButton
            label="Bag"
            icon={<ShoppingBag />}
            variant="accent"
            count={itemCount}
            aria-haspopup="dialog"
            onClick={openBag}
          />
        </div>
      </div>

      <nav id={menuId} className={styles.mobileMenu} aria-label="Menu" hidden={!menuOpen}>
        <ul>
          {NAV_CATEGORIES.map((category) => (
            <li key={category.slug}>
              <NavLink
                to={`/shop/${category.slug}`}
                className={styles.mobileLink}
                data-highlight={category.highlight || undefined}
              >
                {category.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {searchOpen && <SearchPanel id={searchId} onClose={closeSearch} />}
    </header>
  );
}
