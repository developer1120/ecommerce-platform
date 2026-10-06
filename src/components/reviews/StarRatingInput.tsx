import { useId, useState } from 'react';
import { Star } from 'lucide-react';
import type { Stars } from '@/domain/reviews';
import styles from './Reviews.module.css';

const WORDS: Record<Stars, string> = { 1: 'Poor', 2: 'Fair', 3: 'Good', 4: 'Very good', 5: 'Excellent' };

interface StarRatingInputProps {
  value: Stars | null;
  onChange: (value: Stars) => void;
  error?: string;
}

/**
 * Five radio buttons drawn as stars. Arrow keys move between them as with
 * any radio group, and hovering previews the choice.
 */
export function StarRatingInput({ value, onChange, error }: StarRatingInputProps) {
  const name = useId();
  const errorId = `${name}-error`;
  const [hover, setHover] = useState<Stars | null>(null);
  const shown = hover ?? value ?? 0;

  return (
    <fieldset className={styles.starInput} aria-describedby={error ? errorId : undefined} aria-invalid={error ? true : undefined}>
      <legend className={styles.label}>Your rating</legend>
      <div className={styles.starChoices} onMouseLeave={() => setHover(null)}>
        {([1, 2, 3, 4, 5] as Stars[]).map((stars) => (
          <label key={stars} className={styles.starChoice} data-on={stars <= shown || undefined} onMouseEnter={() => setHover(stars)}>
            <input
              type="radio"
              name={name}
              value={stars}
              checked={value === stars}
              onChange={() => onChange(stars)}
              className="visually-hidden"
              aria-label={`${stars} ${stars === 1 ? 'star' : 'stars'}, ${WORDS[stars]}`}
            />
            <Star aria-hidden="true" />
          </label>
        ))}
        <span className={styles.starWord} aria-hidden="true">
          {shown ? WORDS[shown as Stars] : 'Tap a star'}
        </span>
      </div>
      {error && (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      )}
    </fieldset>
  );
}
