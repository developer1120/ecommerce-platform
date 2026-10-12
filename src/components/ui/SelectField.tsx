import { forwardRef, useId, type SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { cx } from '@/lib/cx';
import textFieldStyles from './TextField.module.css';
import styles from './SelectField.module.css';

export interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: { value: string; label: string }[];
  /** Shown first with an empty value, e.g. "Choose a state". */
  placeholder?: string;
  error?: string | null;
}

/** A native select styled like TextField, with the same label and error wiring. */
export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(function SelectField(
  { label, options, placeholder, error, id, className, required, ...rest },
  ref,
) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const errorId = error ? `${selectId}-error` : undefined;

  return (
    <div className={cx(textFieldStyles.field, className)}>
      <label htmlFor={selectId} className={textFieldStyles.label}>
        {label}
        {required && (
          <span className={textFieldStyles.required} aria-hidden="true">
            *
          </span>
        )}
      </label>
      <div className={cx(textFieldStyles.control, styles.control)} data-invalid={error ? true : undefined}>
        <select
          ref={ref}
          id={selectId}
          className={styles.select}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId}
          {...rest}
        >
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown className={styles.chevron} aria-hidden="true" />
      </div>
      {error && (
        <p id={errorId} className={textFieldStyles.error}>
          {error}
        </p>
      )}
    </div>
  );
});
