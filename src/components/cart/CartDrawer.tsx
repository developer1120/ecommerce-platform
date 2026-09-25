import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router';
import { ShoppingBag, X } from 'lucide-react';
import { preloadCheckout } from '@/app/lazyPages';
import { HeadingIcon } from '@/components/ui';
import { formatMoney } from '@/domain/money';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useModalLayer } from '@/hooks/useModalLayer';
import { useCart } from '@/state/CartProvider';
import { useCartDrawer } from '@/state/CartDrawerProvider';
import { usePromo } from '@/state/PromoProvider';
import { useToast } from '@/state/ToastProvider';
import { CartLineItem } from './CartLineItem';
import { FreeShippingMeter } from './FreeShippingMeter';
import styles from './CartDrawer.module.css';

export { APP_SHELL_SELECTOR } from '@/hooks/useModalLayer';
/** Where focus lands on close if whatever opened the drawer has gone. */
const BAG_BUTTON_SELECTOR = 'header button[aria-haspopup="dialog"]';

/**
 * The bag as a modal panel from the right. It traps focus, closes on Escape
 * or a backdrop click, locks page scroll and returns focus when it closes.
 */
export function CartDrawer() {
  const { isOpen, close } = useCartDrawer();
  const { lines, itemCount, subtotal, savings, setQuantity, remove, restoreLine } = useCart();
  const { toast } = useToast();
  const { promotion, evaluation } = usePromo();
  const discount = evaluation?.ok ? evaluation.discount : 0;
  const panelRef = useRef<HTMLDivElement>(null);

  useFocusTrap(panelRef, isOpen, () => document.querySelector<HTMLElement>(BAG_BUTTON_SELECTOR));

  // Any navigation, including the back button, closes the drawer.
  const { pathname } = useLocation();
  useEffect(() => {
    close();
  }, [pathname, close]);

  useModalLayer(isOpen, close);

  // Checkout is the likely next step, so its code starts loading now.
  const hasLines = lines.length > 0;
  useEffect(() => {
    if (isOpen && hasLines) void preloadCheckout();
  }, [isOpen, hasLines]);

  if (!isOpen) return null;

  return createPortal(
    <div className={styles.overlay} onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <div
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-drawer-title"
        tabIndex={-1}
      >
        <header className={styles.header}>
          <h2 id="cart-drawer-title" className={styles.title}>
            <HeadingIcon icon={ShoppingBag} />
            Your bag {itemCount > 0 && <span className={styles.count}>({itemCount})</span>}
          </h2>
          <button type="button" className={styles.close} aria-label="Close bag" onClick={close}>
            <X aria-hidden="true" />
          </button>
        </header>

        {lines.length === 0 ? (
          <div className={styles.empty}>
            <ShoppingBag className={styles.emptyIcon} aria-hidden="true" />
            <p className={styles.emptyTitle}>Your bag is empty</p>
            <p>Find something you'll keep for years.</p>
            <Link to="/shop/new" className={styles.primary} onClick={close}>
              Shop new arrivals
            </Link>
          </div>
        ) : (
          <>
            <div className={styles.scroll}>
              <FreeShippingMeter subtotal={subtotal - discount} />
              <ul className={styles.lines} aria-label="Items in your bag">
                {lines.map((line) => (
                  <CartLineItem
                    key={line.variantId}
                    line={line}
                    onNavigate={close}
                    onQuantityChange={(quantity) => setQuantity(line.variantId, quantity)}
                    onRemove={() => {
                      remove(line.variantId);
                      // The focused Remove button is about to disappear; keep focus inside the panel.
                      panelRef.current?.focus();
                      toast({
                        title: 'Removed from your bag',
                        description: line.name,
                        tone: 'info',
                        action: { label: 'Undo', onClick: () => restoreLine(line) },
                      });
                    }}
                  />
                ))}
              </ul>
            </div>
            <footer className={styles.footer}>
              {savings > 0 && (
                <p className={styles.row} data-tone="saving">
                  <span>You're saving</span>
                  <span>{formatMoney(savings)}</span>
                </p>
              )}
              {discount > 0 && (
                <p className={styles.row} data-tone="saving">
                  <span>Promo {promotion?.code}</span>
                  <span>−{formatMoney(discount)}</span>
                </p>
              )}
              <p className={styles.row} data-tone="total">
                <span>Subtotal</span>
                <span>{formatMoney(subtotal - discount)}</span>
              </p>
              <p className={styles.note}>Shipping and tax are worked out at checkout.</p>
              <Link to="/checkout" className={styles.primary} onClick={close}>
                Checkout
              </Link>
              <Link to="/cart" className={styles.secondary} onClick={close}>
                View bag
              </Link>
              <button type="button" className={styles.secondary} onClick={close}>
                Keep shopping
              </button>
            </footer>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
