import { useId } from 'react';
import { ChevronDown, Truck } from 'lucide-react';
import { HeadingIcon } from '@/components/ui';
import { FREE_SHIPPING_THRESHOLD } from '@/config/store';
import { US_STATES, type UsState } from '@/data/usStates';
import { formatMoney, type Cents } from '@/domain/money';
import {
  availableMethods,
  deliveryWindow,
  formatDeliveryWindow,
  quoteShipping,
  type ShippingMethod,
  type ShippingMethodId,
} from '@/domain/shipping';
import styles from './ShippingEstimator.module.css';

interface ShippingEstimatorProps {
  destination: UsState | undefined;
  method: ShippingMethod;
  merchandiseTotal: Cents;
  promoFreeShipping: boolean;
  onStateChange: (code: string | null) => void;
  onMethodChange: (id: ShippingMethodId) => void;
}

/** Choose where the order goes and how fast; each method shows its price and delivery dates. */
export function ShippingEstimator({
  destination,
  method,
  merchandiseTotal,
  promoFreeShipping,
  onStateChange,
  onMethodChange,
}: ShippingEstimatorProps) {
  const selectId = useId();
  const remote = Boolean(destination?.remote);
  const now = new Date();

  return (
    <div className={styles.estimator}>
      <div className={styles.field}>
        <label htmlFor={selectId} className={styles.label}>
          Ship to
        </label>
        <div className={styles.select}>
          <select id={selectId} value={destination?.code ?? ''} onChange={(event) => onStateChange(event.target.value || null)}>
            <option value="">Choose a state</option>
            {US_STATES.map((state) => (
              <option key={state.code} value={state.code}>
                {state.name}
              </option>
            ))}
          </select>
          <ChevronDown aria-hidden="true" />
        </div>
      </div>

      <fieldset className={styles.methods}>
        <legend className={styles.label}>
          <HeadingIcon icon={Truck} />
          Delivery
        </legend>
        {availableMethods(remote).map((option) => {
          const quote = quoteShipping(option, {
            merchandiseTotal,
            threshold: FREE_SHIPPING_THRESHOLD,
            promoFreeShipping,
            remote,
          });
          return (
            <label key={option.id} className={styles.method}>
              <input
                type="radio"
                name={`${selectId}-method`}
                value={option.id}
                checked={method.id === option.id}
                onChange={() => onMethodChange(option.id)}
              />
              <span className={styles.methodText}>
                <span className={styles.methodName}>{option.label}</span>
                <span className={styles.methodWhen}>{formatDeliveryWindow(deliveryWindow(option, now))}</span>
              </span>
              <span className={styles.methodPrice}>
                {quote.price === 0 ? (
                  <>
                    <s className={styles.was}>{formatMoney(quote.fullPrice)}</s> Free
                  </>
                ) : (
                  formatMoney(quote.price)
                )}
              </span>
            </label>
          );
        })}
        {remote && <p className={styles.hint}>Next-day delivery isn't available to {destination!.name}.</p>}
      </fieldset>
    </div>
  );
}
