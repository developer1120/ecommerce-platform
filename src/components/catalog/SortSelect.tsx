import { useId } from 'react';
import { ChevronDown } from 'lucide-react';
import { SORT_OPTIONS, type SortKey } from '@/domain/catalogFilters';
import { cx } from '@/lib/cx';
import styles from './SortSelect.module.css';

interface SortSelectProps {
  value: SortKey;
  onChange: (sort: SortKey) => void;
  /** Keeps "Sort by" for screen readers only, where space is tight. */
  hideLabel?: boolean;
}

export function SortSelect({ value, onChange, hideLabel = false }: SortSelectProps) {
  const id = useId();
  return (
    <div className={styles.sort}>
      <label htmlFor={id} className={cx(styles.label, hideLabel && 'visually-hidden')}>
        Sort by
      </label>
      <div className={styles.control}>
        <select id={id} value={value} onChange={(event) => onChange(event.target.value as SortKey)}>
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown className={styles.chevron} aria-hidden="true" />
      </div>
    </div>
  );
}
