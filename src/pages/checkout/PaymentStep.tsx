import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { ArrowRight, CreditCard, FlaskConical } from 'lucide-react';
import { ErrorSummary } from '@/components/checkout/ErrorSummary';
import { Badge, Button, HeadingIcon, TextField } from '@/components/ui';
import {
  BRAND_NAMES,
  CARD_FIELDS,
  cvcLength,
  describeCard,
  detectBrand,
  formatCardExpiry,
  formatCardNumber,
  formatExpiry,
  TEST_CARDS,
  toSavedCard,
  validateCard,
  validateCardField,
  type CardErrors,
  type CardField,
  type CardInput,
} from '@/domain/payment';
import { useCheckout } from '@/state/CheckoutProvider';
import styles from './CheckoutStep.module.css';

const cardFieldId = (field: CardField) => `card-${field}`;
const EMPTY_CARD: CardInput = { name: '', number: '', expiry: '', cvc: '' };

/**
 * A demo card form. It checks what is typed like a real one would, but only
 * the brand, last four digits, expiry and name ever leave this component.
 */
export function PaymentStep() {
  const navigate = useNavigate();
  const { draft, saveCard } = useCheckout();
  const [editing, setEditing] = useState(draft.card === null);
  const [values, setValues] = useState<CardInput>(() => ({
    ...EMPTY_CARD,
    name: `${draft.address.firstName} ${draft.address.lastName}`.trim(),
  }));
  const [errors, setErrors] = useState<CardErrors>({});
  const [summary, setSummary] = useState<{ fieldId: string; message: string }[]>([]);
  const [failedSubmits, setFailedSubmits] = useState(0);
  const summaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (failedSubmits > 0) summaryRef.current?.focus();
  }, [failedSubmits]);

  if (!draft.addressConfirmed) return <Navigate to="/checkout" replace />;
  if (!draft.deliveryConfirmed) return <Navigate to="/checkout/delivery" replace />;

  const brand = detectBrand(values.number);

  function check(field: CardField, next: CardInput) {
    const message = validateCardField(field, next, new Date());
    setErrors((current) => {
      const updated = { ...current };
      if (message) updated[field] = message;
      else delete updated[field];
      return updated;
    });
  }

  function change(field: CardField, raw: string) {
    const value =
      field === 'number' ? formatCardNumber(raw) : field === 'expiry' ? formatExpiry(raw) : field === 'cvc' ? raw.replace(/\D/g, '').slice(0, 4) : raw;
    const next = { ...values, [field]: value };
    setValues(next);
    if (errors[field]) check(field, next);
  }

  function blur(field: CardField) {
    if (!values[field] && !errors[field]) return;
    check(field, values);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const found = validateCard(values, new Date());
    setErrors(found);
    const list = CARD_FIELDS.filter((field) => found[field]).map((field) => ({
      fieldId: cardFieldId(field),
      message: found[field]!,
    }));
    setSummary(list);
    if (list.length > 0) {
      setFailedSubmits((count) => count + 1);
      return;
    }
    saveCard(toSavedCard(values));
    // Drop the typed number and code as soon as they have done their job.
    setValues(EMPTY_CARD);
    navigate('/checkout/review');
  }

  if (!editing && draft.card) {
    return (
      <section className={styles.form} aria-labelledby="payment-step-title">
        <h2 id="payment-step-title" className={styles.title}>
          <HeadingIcon icon={CreditCard} />
          Payment
        </h2>
        <div className={styles.addressCard}>
          <div>
            <p className={styles.addressLabel}>Paying with</p>
            <p className={styles.cardLine}>
              <CreditCard aria-hidden="true" /> {describeCard(draft.card)}
            </p>
            <p className={styles.note}>
              Expires {formatCardExpiry(draft.card)} · {draft.card.name}
            </p>
          </div>
          <button type="button" className={styles.editButton} onClick={() => setEditing(true)}>
            Use a different card
          </button>
        </div>
        <Button size="lg" trailingIcon={<ArrowRight />} className={styles.submit} onClick={() => navigate('/checkout/review')}>
          Continue to review
        </Button>
      </section>
    );
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate aria-labelledby="payment-step-title">
      <h2 id="payment-step-title" className={styles.title}>
        <HeadingIcon icon={CreditCard} />
        Payment
      </h2>
      <ErrorSummary ref={summaryRef} errors={summary} />

      <p className={styles.demoNote}>
        <FlaskConical aria-hidden="true" />
        <span>
          This is a demo shop and no money changes hands. Use the test card <strong>{TEST_CARDS.approved}</strong> with any
          future expiry date and any security code. Please don't enter a real card.
        </span>
      </p>

      <div className={styles.group}>
        <TextField
          id={cardFieldId('number')}
          label="Card number"
          inputMode="numeric"
          autoComplete="cc-number"
          placeholder="1234 1234 1234 1234"
          required
          value={values.number}
          error={errors.number}
          onChange={(event) => change('number', event.target.value)}
          onBlur={() => blur('number')}
          trailing={brand ? <Badge tone="inverse">{BRAND_NAMES[brand]}</Badge> : <CreditCard aria-hidden="true" />}
        />
        <div className={styles.row2}>
          <TextField
            id={cardFieldId('expiry')}
            label="Expiry date"
            hint="MM / YY"
            inputMode="numeric"
            autoComplete="cc-exp"
            placeholder="MM / YY"
            required
            value={values.expiry}
            error={errors.expiry}
            onChange={(event) => change('expiry', event.target.value)}
            onBlur={() => blur('expiry')}
          />
          <TextField
            id={cardFieldId('cvc')}
            label="Security code"
            hint={`${cvcLength(brand)} digits, ${brand === 'amex' ? 'on the front' : 'on the back'}`}
            inputMode="numeric"
            autoComplete="cc-csc"
            required
            value={values.cvc}
            error={errors.cvc}
            onChange={(event) => change('cvc', event.target.value)}
            onBlur={() => blur('cvc')}
          />
        </div>
        <TextField
          id={cardFieldId('name')}
          label="Name on card"
          autoComplete="cc-name"
          required
          value={values.name}
          error={errors.name}
          onChange={(event) => change('name', event.target.value)}
          onBlur={() => blur('name')}
        />
        <p className={styles.note}>Billing address: the same as shipping.</p>
      </div>

      <div className={styles.actions}>
        {draft.card && (
          <button type="button" className={styles.editButton} onClick={() => setEditing(false)}>
            Keep {describeCard(draft.card)}
          </button>
        )}
        <Button type="submit" size="lg" trailingIcon={<ArrowRight />} className={styles.submit}>
          Continue to review
        </Button>
      </div>
    </form>
  );
}
