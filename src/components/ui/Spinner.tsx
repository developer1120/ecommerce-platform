import { cx } from '@/lib/cx';
import styles from './Spinner.module.css';

interface SpinnerProps {
  className?: string;
  /** Announced to screen readers. Leave empty when the parent already says what is loading. */
  label?: string;
}

export function Spinner({ className, label }: SpinnerProps) {
  return (
    <span className={cx(styles.spinner, className)} role={label ? 'status' : undefined} aria-hidden={!label}>
      <svg viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
      {label && <span className="visually-hidden">{label}</span>}
    </span>
  );
}
