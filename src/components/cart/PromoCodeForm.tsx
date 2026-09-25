import { useState, type FormEvent } from 'react';
import { CircleAlert, Tag, X } from 'lucide-react';
import { Button, TextField } from '@/components/ui';
import { formatMoney } from '@/domain/money';
import { usePromo } from '@/state/PromoProvider';
import styles from './PromoCodeForm.module.css';

/** Enter a promo code, or see and remove the one applied. */
export function PromoCodeForm() {
  const { promotion, evaluation, apply, remove } = usePromo();
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setApplying(true);
    const result = await apply(input);
    setApplying(false);
    if (result.ok) {
      setInput('');
      setError(null);
    } else {
      setError(result.message);
    }
  }

  if (promotion && evaluation) {
    return (
      <div className={styles.applied} data-ok={evaluation.ok || undefined}>
        <Tag className={styles.tagIcon} aria-hidden="true" />
        <div className={styles.appliedText}>
          <p className={styles.code}>{promotion.code}</p>
          <p className={styles.description} role="status">
            {evaluation.ok ? (
              evaluation.freeShipping ? (
                'Free standard shipping applied'
              ) : (
                <>
                  {promotion.description}: <span className={styles.amount}>−{formatMoney(evaluation.discount)}</span>
                </>
              )
            ) : (
              <span className={styles.problem}>
                <CircleAlert aria-hidden="true" />
                {evaluation.message}
              </span>
            )}
          </p>
        </div>
        <button type="button" className={styles.remove} aria-label={`Remove code ${promotion.code}`} onClick={remove}>
          <X aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <TextField
        label="Promo code"
        placeholder="WELCOME10"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        value={input}
        error={error}
        onChange={(event) => {
          setInput(event.target.value);
          if (error) setError(null);
        }}
      />
      <Button type="submit" variant="secondary" loading={applying}>
        Apply
      </Button>
    </form>
  );
}
