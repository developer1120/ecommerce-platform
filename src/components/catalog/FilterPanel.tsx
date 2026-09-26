import { BadgeDollarSign, PackageCheck, Palette, Shapes, Star } from 'lucide-react';
import { HeadingIcon, ToggleChip } from '@/components/ui';
import type { CatalogFilters, Facets, MinRating } from '@/domain/catalogFilters';
import { toggleIn } from '@/hooks/useCatalogFilters';
import styles from './FilterPanel.module.css';

interface FilterPanelProps {
  facets: Facets;
  filters: CatalogFilters;
  onChange: (change: Partial<CatalogFilters>) => void;
}

function Count({ value }: { value: number }) {
  return <span className={styles.count}>{value}</span>;
}

/** Checkbox and chip groups for narrowing a collection. Counts predict the result of each choice. */
export function FilterPanel({ facets, filters, onChange }: FilterPanelProps) {
  return (
    <div className={styles.panel}>
      {facets.types.length > 1 && (
        <fieldset className={styles.group}>
          <legend className={styles.legend}>
            <HeadingIcon icon={Shapes} />
            Category
          </legend>
          {facets.types.map((option) => (
            <label key={option.value} className={styles.check} data-empty={option.count === 0 || undefined}>
              <input
                type="checkbox"
                checked={filters.types.includes(option.value)}
                onChange={() => onChange({ types: toggleIn(filters.types, option.value) })}
              />
              <span className={styles.checkLabel}>{option.label}</span>
              <Count value={option.count} />
            </label>
          ))}
        </fieldset>
      )}

      {facets.colors.length > 0 && (
        <fieldset className={styles.group}>
          <legend className={styles.legend}>
            <HeadingIcon icon={Palette} />
            Color
          </legend>
          <div className={styles.chips}>
            {facets.colors.map((option) => (
              <ToggleChip
                key={option.value}
                selected={filters.colors.includes(option.value)}
                onToggle={() => onChange({ colors: toggleIn(filters.colors, option.value) })}
                swatch={option.swatch}
                accessibleLabel={`${option.label}, ${option.count} ${option.count === 1 ? 'product' : 'products'}`}
              >
                {option.label}
              </ToggleChip>
            ))}
          </div>
        </fieldset>
      )}

      <fieldset className={styles.group}>
        <legend className={styles.legend}>
          <HeadingIcon icon={BadgeDollarSign} />
          Price
        </legend>
        {facets.prices.map((option) => (
          <label key={option.value} className={styles.check} data-empty={option.count === 0 || undefined}>
            <input
              type="checkbox"
              checked={filters.prices.includes(option.value)}
              onChange={() => onChange({ prices: toggleIn(filters.prices, option.value) })}
            />
            <span className={styles.checkLabel}>{option.label}</span>
            <Count value={option.count} />
          </label>
        ))}
      </fieldset>

      <fieldset className={styles.group}>
        <legend className={styles.legend}>
          <HeadingIcon icon={Star} />
          Rating
        </legend>
        <label className={styles.check}>
          <input
            type="radio"
            name="min-rating"
            checked={filters.minRating === null}
            onChange={() => onChange({ minRating: null })}
          />
          <span className={styles.checkLabel}>Any rating</span>
        </label>
        {facets.ratings.map((option) => (
          <label key={option.value} className={styles.check} data-empty={option.count === 0 || undefined}>
            <input
              type="radio"
              name="min-rating"
              checked={filters.minRating === option.value}
              onChange={() => onChange({ minRating: option.value as MinRating })}
            />
            <span className={styles.checkLabel}>
              <Star className={styles.star} aria-hidden="true" />
              {option.value.toFixed(1)} and up
            </span>
            <Count value={option.count} />
          </label>
        ))}
      </fieldset>

      <fieldset className={styles.group}>
        <legend className={styles.legend}>
          <HeadingIcon icon={PackageCheck} />
          Availability
        </legend>
        <label className={styles.check}>
          <input type="checkbox" checked={filters.inStock} onChange={() => onChange({ inStock: !filters.inStock })} />
          <span className={styles.checkLabel}>In stock only</span>
          <Count value={facets.inStock} />
        </label>
      </fieldset>
    </div>
  );
}
