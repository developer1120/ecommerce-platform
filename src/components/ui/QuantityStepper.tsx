import { Minus, Plus } from 'lucide-react';
import { cx } from '@/lib/cx';
import styles from './QuantityStepper.module.css';

interface QuantityStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max: number;
  /** What is being counted, for the accessible names: "Quantity of Oak serving board". */
  label: string;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Minus and plus buttons around a count, with the limits enforced. At a limit
 * the button is aria-disabled rather than disabled, so it keeps keyboard focus.
 */
export function QuantityStepper({ value, onChange, min = 1, max, label, size = 'md', className }: QuantityStepperProps) {
  const atMin = value <= min;
  const atMax = value >= max;
  return (
    <div className={cx(styles.stepper, className)} data-size={size} role="group" aria-label={label}>
      <button
        type="button"
        className={styles.button}
        aria-label="Decrease"
        aria-disabled={atMin}
        onClick={() => !atMin && onChange(value - 1)}
      >
        <Minus aria-hidden="true" />
      </button>
      {/* A plain live region rather than <output>, which would add another "status" role to the page. */}
      <span className={styles.value} aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        className={styles.button}
        aria-label="Increase"
        aria-disabled={atMax}
        title={atMax ? 'No more available' : undefined}
        onClick={() => !atMax && onChange(value + 1)}
      >
        <Plus aria-hidden="true" />
      </button>
    </div>
  );
}
