import type { FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { ArrowRight, Gauge, Truck } from 'lucide-react';
import { Button, HeadingIcon } from '@/components/ui';
import { FREE_SHIPPING_THRESHOLD } from '@/config/store';
import { findState } from '@/data/usStates';
import { formatAddress } from '@/domain/address';
import { sumCents, formatMoney } from '@/domain/money';
import { lineTotal } from '@/domain/cart';
import { availableMethods, deliveryWindow, formatDeliveryWindow, quoteShipping } from '@/domain/shipping';
import { useCart } from '@/state/CartProvider';
import { useCheckout } from '@/state/CheckoutProvider';
import { usePromo } from '@/state/PromoProvider';
import styles from './CheckoutStep.module.css';

/** Where it's going, and how fast. */
export function DeliveryStep() {
  const navigate = useNavigate();
  const { draft, setMethod, confirmDelivery } = useCheckout();
  const { lines } = useCart();
  const { evaluation } = usePromo();
  if (!draft.addressConfirmed) return <Navigate to="/checkout" replace />;

  const destination = findState(draft.address.state);
  const remote = Boolean(destination?.remote);
  const methods = availableMethods(remote);
  const chosen = methods.find((method) => method.id === draft.methodId) ?? methods[0]!;
  const merchandiseTotal = sumCents(lines.map(lineTotal)) - (evaluation?.ok ? evaluation.discount : 0);
  const now = new Date();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setMethod(chosen.id);
    confirmDelivery();
    navigate('/checkout/payment');
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} aria-labelledby="delivery-step-title">
      <h2 id="delivery-step-title" className={styles.title}>
        <HeadingIcon icon={Truck} />
        Delivery
      </h2>

      <div className={styles.addressCard}>
        <div>
          <p className={styles.addressLabel}>Shipping to</p>
          <address>
            {formatAddress(draft.address).map((line) => (
              <span key={line} className={styles.addressLine}>
                {line}
              </span>
            ))}
          </address>
          <p className={styles.note}>{draft.address.email}</p>
        </div>
        <Link to="/checkout" className={styles.editLink} aria-label="Change address">
          Change
        </Link>
      </div>

      <fieldset className={styles.group}>
        <legend className={styles.legend}>
          <HeadingIcon icon={Gauge} />
          Delivery speed
        </legend>
        <div className={styles.options}>
          {methods.map((method) => {
            const quote = quoteShipping(method, {
              merchandiseTotal,
              threshold: FREE_SHIPPING_THRESHOLD,
              promoFreeShipping: Boolean(evaluation?.ok && evaluation.freeShipping),
              remote,
            });
            return (
              <label key={method.id} className={styles.option}>
                <input
                  type="radio"
                  name="delivery-method"
                  value={method.id}
                  checked={chosen.id === method.id}
                  onChange={() => setMethod(method.id)}
                />
                <span className={styles.optionText}>
                  <span className={styles.optionName}>{method.label}</span>
                  <span className={styles.optionDetail}>Arrives {formatDeliveryWindow(deliveryWindow(method, now))}</span>
                </span>
                <span className={styles.optionPrice}>
                  {quote.price === 0 ? 'Free' : formatMoney(quote.price)}
                </span>
              </label>
            );
          })}
        </div>
        {remote && <p className={styles.note}>Next-day delivery isn't available to {destination!.name}.</p>}
        <p className={styles.note}>Orders placed before 2pm Eastern on a weekday leave the studio the same day.</p>
      </fieldset>

      <Button type="submit" size="lg" trailingIcon={<ArrowRight />} className={styles.submit}>
        Continue to payment
      </Button>
    </form>
  );
}
