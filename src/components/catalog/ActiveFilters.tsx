import { FilterX } from 'lucide-react';
import { RemovableChip } from '@/components/ui';
import { activeFilterCount, priceBandLabel, type CatalogFilters } from '@/domain/catalogFilters';
import styles from './ActiveFilters.module.css';

interface ActiveFiltersProps {
  filters: CatalogFilters;
  onChange: (change: Partial<CatalogFilters>) => void;
  onClear: () => void;
}

/** The applied filters as removable chips, with a way to clear them all. */
export function ActiveFilters({ filters, onChange, onClear }: ActiveFiltersProps) {
  if (activeFilterCount(filters) === 0) return null;

  return (
    <div className={styles.active}>
      <ul className={styles.list} aria-label="Applied filters">
        {filters.types.map((type) => (
          <li key={`type-${type}`}>
            <RemovableChip onRemove={() => onChange({ types: filters.types.filter((t) => t !== type) })}>
              {type}
            </RemovableChip>
          </li>
        ))}
        {filters.colors.map((color) => (
          <li key={`color-${color}`}>
            <RemovableChip onRemove={() => onChange({ colors: filters.colors.filter((c) => c !== color) })}>
              {color}
            </RemovableChip>
          </li>
        ))}
        {filters.prices.map((band) => (
          <li key={`price-${band}`}>
            <RemovableChip onRemove={() => onChange({ prices: filters.prices.filter((b) => b !== band) })}>
              {priceBandLabel(band)}
            </RemovableChip>
          </li>
        ))}
        {filters.minRating !== null && (
          <li>
            <RemovableChip onRemove={() => onChange({ minRating: null })}>
              {`${filters.minRating.toFixed(1)} stars and up`}
            </RemovableChip>
          </li>
        )}
        {filters.inStock && (
          <li>
            <RemovableChip onRemove={() => onChange({ inStock: false })}>In stock only</RemovableChip>
          </li>
        )}
      </ul>
      <button type="button" className={styles.clear} onClick={onClear}>
        <FilterX aria-hidden="true" />
        Clear all
      </button>
    </div>
  );
}
