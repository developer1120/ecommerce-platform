import { Link, Navigate } from 'react-router';
import { ClipboardCheck, CreditCard, MapPin, Package, Truck } from 'lucide-react';
import { ProductArt } from '@/components/product/ProductArt';
import { HeadingIcon } from '@/components/ui';
import { findState } from '@/data/usStates';
import { formatAddress } from '@/domain/address';
import { describeOptions, lineTotal } from '@/domain/cart';
import { formatMoney } from '@/domain/money';
import { describeCard, formatCardExpiry } from '@/domain/payment';
import { availableMethods, deliveryWindow, formatDeliveryWindow } from '@/domain/shipping';
import { useCart } from '@/state/CartProvider';
import { useCheckout } from '@/state/CheckoutProvider';
import { useCheckoutTotals } from './CheckoutLayout';
import { PlaceOrder } from './PlaceOrder';
import styles from './CheckoutStep.module.css';

/** Everything in one place before the order is placed, with a way back to change each part. */
export function ReviewStep() {
  const { draft } = useCheckout();
  const { lines } = useCart();
  const totals = useCheckoutTotals();

  if (!draft.addressConfirmed) return <Navigate to="/checkout" replace />;
  if (!draft.deliveryConfirmed) return <Navigate to="/checkout/delivery" replace />;
  if (!draft.card) return <Navigate to="/checkout/payment" replace />;

  const remote = Boolean(findState(draft.address.state)?.remote);
  const methods = availableMethods(remote);
  const method = methods.find((candidate) => candidate.id === draft.methodId) ?? methods[0]!;

  return (
    <section className={styles.form} aria-labelledby="review-step-title">
      <h2 id="review-step-title" className={styles.title}>
        <HeadingIcon icon={ClipboardCheck} />
        Review your order
      </h2>

      <dl className={styles.review}>
        <div className={styles.reviewRow}>
          <dt>
            <MapPin aria-hidden="true" /> Shipping to
          </dt>
          <dd>
            <address>
              {formatAddress(draft.address).map((line) => (
                <span key={line} className={styles.addressLine}>
                  {line}
                </span>
              ))}
            </address>
            <span className={styles.note}>{draft.address.email}</span>
          </dd>
          <dd className={styles.editCell}>
            <Link to="/checkout" className={styles.editLink} aria-label="Change address">
              Change
            </Link>
          </dd>
        </div>
        <div className={styles.reviewRow}>
          <dt>
            <Truck aria-hidden="true" /> Delivery
          </dt>
          <dd>
            {method.label}, arriving {formatDeliveryWindow(deliveryWindow(method, new Date()))}
          </dd>
          <dd className={styles.editCell}>
            <Link to="/checkout/delivery" className={styles.editLink} aria-label="Change delivery">
              Change
            </Link>
          </dd>
        </div>
        <div className={styles.reviewRow}>
          <dt>
            <CreditCard aria-hidden="true" /> Payment
          </dt>
          <dd>
            {describeCard(draft.card)}
            <span className={styles.note}>
              Expires {formatCardExpiry(draft.card)} · {draft.card.name}
            </span>
          </dd>
          <dd className={styles.editCell}>
            <Link to="/checkout/payment" className={styles.editLink} aria-label="Change payment">
              Change
            </Link>
          </dd>
        </div>
      </dl>

      <section aria-labelledby="review-items-title">
        <h3 id="review-items-title" className={styles.legend}>
          <HeadingIcon icon={Package} />
          Items
        </h3>
        <ul className={styles.reviewItems}>
          {lines.map((line) => (
            <li key={line.variantId} className={styles.reviewItem}>
              <ProductArt art={line.art} color={line.swatch} className={styles.reviewThumb} />
              <span className={styles.optionText}>
                <span className={styles.optionName}>{line.name}</span>
                <span className={styles.optionDetail}>
                  {[describeOptions(line.options), `Qty ${line.quantity}`].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className={styles.optionPrice}>{formatMoney(lineTotal(line))}</span>
            </li>
          ))}
        </ul>
      </section>

      <PlaceOrder total={totals.total} card={draft.card} />
    </section>
  );
}
