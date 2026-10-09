import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { cx } from '@/lib/cx';
import styles from './Chip.module.css';

interface ToggleChipProps {
  children: ReactNode;
  selected: boolean;
  onToggle: () => void;
  /** A color dot, for swatch filters. */
  swatch?: string;
  /** A fuller accessible name than the visible text, e.g. "Lilac, 2 products". */
  accessibleLabel?: string;
  className?: string;
}

/** A pill that turns a filter on or off. */
export function ToggleChip({ children, selected, onToggle, swatch, accessibleLabel, className }: ToggleChipProps) {
  return (
    <button
      type="button"
      aria-label={accessibleLabel}
      className={cx(styles.chip, className)}
      aria-pressed={selected}
      data-selected={selected || undefined}
      onClick={onToggle}
    >
      {swatch && <span className={styles.swatch} style={{ background: swatch }} aria-hidden="true" />}
      {children}
    </button>
  );
}

interface RemovableChipProps {
  children: string;
  onRemove: () => void;
  className?: string;
}

/** A pill for an applied filter, with a button that clears it. */
export function RemovableChip({ children, onRemove, className }: RemovableChipProps) {
  return (
    <span className={cx(styles.chip, className)} data-selected>
      {children}
      <button type="button" className={styles.remove} aria-label={`Remove ${children}`} onClick={onRemove}>
        <X aria-hidden="true" />
      </button>
    </span>
  );
}
