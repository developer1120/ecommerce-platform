import { useState, type FormEvent } from 'react';
import { Send } from 'lucide-react';
import { isApiError } from '@/api/client';
import { submitReview } from '@/api/reviewsApi';
import { Button, TextField } from '@/components/ui';
import { SelectField } from '@/components/ui/SelectField';
import {
  BODY_LIMITS,
  FIT_LABELS,
  validateReview,
  type Fit,
  type Review,
  type ReviewErrors,
  type Stars,
} from '@/domain/reviews';
import { useAuth } from '@/state/AuthProvider';
import { StarRatingInput } from './StarRatingInput';
import styles from './Reviews.module.css';

interface ReviewFormProps {
  productId: string;
  askFit: boolean;
  onSubmitted: (review: Review) => void;
  onCancel: () => void;
}

export function ReviewForm({ productId, askFit, onSubmitted, onCancel }: ReviewFormProps) {
  const { token } = useAuth();
  const [rating, setRating] = useState<Stars | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [fit, setFit] = useState<Fit | ''>('');
  const [errors, setErrors] = useState<ReviewErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const found = validateReview({ rating, title, body });
    setErrors(found);
    if (Object.keys(found).length > 0 || !rating || !token) return;
    setSending(true);
    setFailure(null);
    try {
      const review = await submitReview(token, productId, { rating, title, body, ...(fit && { fit }) });
      onSubmitted(review);
    } catch (error) {
      setSending(false);
      setFailure(isApiError(error) ? error.message : "We couldn't post your review. Try again in a moment.");
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate aria-label="Write a review">
      {failure && (
        <p className={styles.failure} role="alert">
          {failure}
        </p>
      )}
      <StarRatingInput value={rating} onChange={setRating} error={errors.rating} />
      <TextField label="Title" value={title} error={errors.title} onChange={(event) => setTitle(event.target.value)} />
      <div className={styles.field}>
        <label htmlFor="review-body" className={styles.label}>
          Your review
        </label>
        <textarea
          id="review-body"
          className={styles.textarea}
          rows={5}
          value={body}
          aria-invalid={errors.body ? true : undefined}
          aria-describedby="review-body-help"
          onChange={(event) => setBody(event.target.value)}
        />
        <p id="review-body-help" className={errors.body ? styles.error : styles.hint}>
          {errors.body ?? `${body.trim().length} / ${BODY_LIMITS.max} · What did you like? How do you use it?`}
        </p>
      </div>
      {askFit && (
        <SelectField
          label="How does it fit? (optional)"
          placeholder="Choose"
          options={(Object.keys(FIT_LABELS) as Fit[]).map((value) => ({ value, label: FIT_LABELS[value] }))}
          value={fit}
          onChange={(event) => setFit(event.target.value as Fit | '')}
        />
      )}
      <div className={styles.formActions}>
        <button type="button" className={styles.textButton} onClick={onCancel}>
          Cancel
        </button>
        <Button type="submit" loading={sending} leadingIcon={<Send />}>
          Post review
        </Button>
      </div>
    </form>
  );
}
