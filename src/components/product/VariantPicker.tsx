import { useId } from 'react';
import { Palette, Ruler, SlidersHorizontal, type LucideIcon } from 'lucide-react';
import { HeadingIcon } from '@/components/ui';
import { stockIfChosen, stockLevel, type Product } from '@/domain/product';
import styles from './VariantPicker.module.css';

/** Colors get a palette, sizes a ruler, anything else a generic option glyph. */
function optionIcon(name: string, isSwatch: boolean): LucideIcon {
  if (isSwatch || /colou?r|shade|scent/i.test(name)) return Palette;
  if (/size|length|width/i.test(name)) return Ruler;
  return SlidersHorizontal;
}

interface VariantPickerProps {
  product: Product;
  selection: Record<string, string>;
  onChange: (optionName: string, value: string) => void;
}

/**
 * One radio group per option. Colors show as swatches, everything else as
 * pills. Values that would be sold out stay selectable, so shoppers can see
 * that a size exists, but are struck through and announced as sold out.
 */
export function VariantPicker({ product, selection, onChange }: VariantPickerProps) {
  const baseId = useId();
  if (product.options.length === 0) return null;

  return (
    <div className={styles.picker}>
      {product.options.map((option) => {
        const isSwatch = option.values.some((value) => value.swatch);
        const chosen = selection[option.name];
        return (
          <fieldset key={option.name} className={styles.group}>
            <legend className={styles.legend}>
              <HeadingIcon icon={optionIcon(option.name, isSwatch)} />
              {option.name}: <span className={styles.chosen}>{chosen}</span>
            </legend>
            <div className={styles.values} data-kind={isSwatch ? 'swatch' : 'pill'}>
              {option.values.map((value) => {
                const left = stockIfChosen(product, selection, option.name, value.value);
                const soldOut = left <= 0;
                const low = stockLevel(left) === 'low';
                return (
                  <label
                    key={value.value}
                    className={styles.value}
                    data-sold-out={soldOut || undefined}
                    data-low={low || undefined}
                    title={isSwatch ? value.value : undefined}
                  >
                    <input
                      type="radio"
                      className="visually-hidden"
                      name={`${baseId}-${option.name}`}
                      value={value.value}
                      checked={chosen === value.value}
                      onChange={() => onChange(option.name, value.value)}
                      aria-label={
                        soldOut ? `${value.value}, sold out` : low ? `${value.value}, only ${left} left` : value.value
                      }
                    />
                    {isSwatch ? (
                      <span className={styles.swatch} style={{ background: value.swatch }} aria-hidden="true" />
                    ) : (
                      <span aria-hidden="true">{value.value}</span>
                    )}
                  </label>
                );
              })}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}
