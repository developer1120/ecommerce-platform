import { useEffect, useState, type FormEvent } from 'react';
import { BellRing, PartyPopper } from 'lucide-react';
import { isApiError } from '@/api/client';
import { subscribeToRestock } from '@/api/stockAlertsApi';
import { Button, TextField } from '@/components/ui';
import { describeOptions } from '@/domain/cart';
import type { Product, Variant } from '@/domain/product';
import { unwatchVariant, watchedVariants, watchVariant } from '@/domain/restockWatch';
import { useAuth } from '@/state/AuthProvider';
import styles from './BackInStock.module.css';

function label(product: Product, variant: Variant): string {
  const options = describeOptions(variant.options);
  return options ? `${product.name} in ${options}` : product.name;
}

/** For a sold-out option: leave an email to hear when it returns. */
export function NotifyMe({ product, variant }: { product: Product; variant: Variant }) {
  const { user, token } = useAuth();
  const [email, setEmail] = useState(user?.email ?? '');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ email: string; again: boolean } | null>(null);
  const [sending, setSending] = useState(false);

  // A different option is a fresh request.
  useEffect(() => {
    setDone(null);
    setError(null);
  }, [variant.id]);

  // Fill in the account's email once the session has loaded, unless something was typed.
  useEffect(() => {
    if (user) setEmail((current) => current || user.email);
  }, [user]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSending(true);
    setError(null);
    try {
      const result = await subscribeToRestock(variant.id, email, token);
      watchVariant(variant.id);
      setDone({ email: result.alert.email, again: result.alreadySubscribed });
    } catch (caught) {
      setError(isApiError(caught) ? caught.message : "We couldn't save that. Try again in a moment.");
    } finally {
      setSending(false);
    }
  }

  if (done) {
    return (
      <p className={styles.done} aria-live="polite">
        <BellRing aria-hidden="true" />
        <span>
          {done.again ? "You're already on the list. " : ''}
          We'll email <strong>{done.email}</strong> as soon as {label(product, variant)} is back.
        </span>
      </p>
    );
  }

  return (
    <form className={styles.notify} onSubmit={handleSubmit} noValidate aria-labelledby={`notify-${variant.id}`}>
      <p id={`notify-${variant.id}`} className={styles.notifyTitle}>
        <BellRing aria-hidden="true" /> Get an email when {label(product, variant)} is back
      </p>
      <div className={styles.notifyRow}>
        <TextField
          label="Email for the alert"
          hideLabel
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          error={error}
          onChange={(event) => {
            setEmail(event.target.value);
            if (error) setError(null);
          }}
        />
        <Button type="submit" variant="secondary" loading={sending}>
          Notify me
        </Button>
      </div>
      <p className={styles.small}>One email when it returns. Nothing else.</p>
    </form>
  );
}

/**
 * Shown when the shopper returns to an option they asked about and it is
 * now in stock. It clears the request so it only shows once.
 */
export function BackInStockBanner({ variant }: { variant: Variant }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (variant.stock > 0 && watchedVariants().includes(variant.id)) {
      setShow(true);
      unwatchVariant(variant.id);
    }
  }, [variant.id, variant.stock]);

  if (!show) return null;
  return (
    <p className={styles.banner} aria-live="polite">
      <PartyPopper aria-hidden="true" /> Back in stock. You asked us to tell you, so here it is.
    </p>
  );
}
