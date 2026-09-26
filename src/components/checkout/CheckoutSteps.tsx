import { Link } from 'react-router';
import { Check } from 'lucide-react';
import styles from './CheckoutSteps.module.css';

export interface CheckoutStep {
  id: string;
  label: string;
  path: string;
}

export const CHECKOUT_STEPS: CheckoutStep[] = [
  { id: 'address', label: 'Address', path: '/checkout' },
  { id: 'delivery', label: 'Delivery', path: '/checkout/delivery' },
  { id: 'payment', label: 'Payment', path: '/checkout/payment' },
  { id: 'review', label: 'Review', path: '/checkout/review' },
];

interface CheckoutStepsProps {
  current: string;
  /** Steps the shopper may jump back to: those already completed. */
  reachable: Set<string>;
}

/** Where the shopper is in checkout. Completed steps link back; later ones don't. */
export function CheckoutSteps({ current, reachable }: CheckoutStepsProps) {
  const currentIndex = CHECKOUT_STEPS.findIndex((step) => step.id === current);
  return (
    <nav aria-label="Checkout progress" className={styles.steps}>
      <ol className={styles.list}>
        {CHECKOUT_STEPS.map((step, index) => {
          const state = index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'upcoming';
          const label = (
            <>
              <span className={styles.marker} aria-hidden="true">
                {state === 'done' ? <Check /> : index + 1}
              </span>
              <span className={styles.label}>{step.label}</span>
              {state === 'done' && <span className="visually-hidden"> (completed)</span>}
            </>
          );
          return (
            <li key={step.id} className={styles.step} data-state={state}>
              {state === 'done' && reachable.has(step.id) ? (
                <Link to={step.path} className={styles.link}>
                  {label}
                </Link>
              ) : (
                <span className={styles.link} aria-current={state === 'current' ? 'step' : undefined}>
                  {label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
