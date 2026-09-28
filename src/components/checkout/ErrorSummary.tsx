import { forwardRef } from 'react';
import { CircleAlert } from 'lucide-react';
import styles from './ErrorSummary.module.css';

interface ErrorSummaryProps {
  /** Field id and message pairs, in form order. */
  errors: { fieldId: string; message: string }[];
}

/**
 * Lists every problem after a failed submit, each linking to its field.
 * Takes focus so screen reader and keyboard users land on it.
 */
export const ErrorSummary = forwardRef<HTMLDivElement, ErrorSummaryProps>(function ErrorSummary({ errors }, ref) {
  if (errors.length === 0) return null;
  return (
    <div ref={ref} className={styles.summary} role="alert" tabIndex={-1} aria-labelledby="error-summary-title">
      <h2 id="error-summary-title" className={styles.title}>
        <CircleAlert aria-hidden="true" />
        {errors.length === 1 ? 'There is a problem' : `There are ${errors.length} problems`}
      </h2>
      <ul className={styles.list}>
        {errors.map((error) => (
          <li key={error.fieldId}>
            <a
              href={`#${error.fieldId}`}
              onClick={(event) => {
                // Focus the field itself; following the hash alone would only scroll.
                event.preventDefault();
                document.getElementById(error.fieldId)?.focus();
              }}
            >
              {error.message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
});
