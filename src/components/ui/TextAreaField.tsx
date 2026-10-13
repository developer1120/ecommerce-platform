import { forwardRef, useId, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { cx } from '@/lib/cx';
import textFieldStyles from './TextField.module.css';
import styles from './TextAreaField.module.css';

export interface TextAreaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  hint?: ReactNode;
  /** Shown under the field. Marks the field invalid while set. */
  error?: string | null;
  /** Shows "120 / 2000" under the field when maxLength is set. */
  showCount?: boolean;
}

/** A multi-line text box with the same label, hint and error wiring as TextField. */
export const TextAreaField = forwardRef<HTMLTextAreaElement, TextAreaFieldProps>(function TextAreaField(
  { label, hint, error, showCount = false, id, className, required, rows = 5, maxLength, value, ...rest },
  ref,
) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  const length = typeof value === 'string' ? value.length : 0;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cx(textFieldStyles.field, className)}>
      <label htmlFor={fieldId} className={textFieldStyles.label}>
        {label}
        {required && (
          <span className={textFieldStyles.required} aria-hidden="true">
            *
          </span>
        )}
      </label>
      <textarea
        ref={ref}
        id={fieldId}
        rows={rows}
        maxLength={maxLength}
        value={value}
        required={required}
        className={styles.textarea}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...rest}
      />
      {(hint || (showCount && maxLength)) && (
        <div className={styles.below}>
          {hint && (
            <p id={hintId} className={textFieldStyles.hint}>
              {hint}
            </p>
          )}
          {showCount && maxLength && (
            // Not a live region: announcing every keystroke would be noise.
            <p className={cx(textFieldStyles.hint, styles.count)} data-near={length > maxLength * 0.9 || undefined}>
              {length} / {maxLength}
            </p>
          )}
        </div>
      )}
      {error && (
        <p id={errorId} className={textFieldStyles.error}>
          {error}
        </p>
      )}
    </div>
  );
});
