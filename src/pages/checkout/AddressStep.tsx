import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { ArrowRight, House, Mail, MapPin } from 'lucide-react';
import { ErrorSummary } from '@/components/checkout/ErrorSummary';
import { Button, HeadingIcon, TextField } from '@/components/ui';
import { SelectField } from '@/components/ui/SelectField';
import { US_STATES } from '@/data/usStates';
import {
  ADDRESS_FIELDS,
  normalizeAddress,
  validateAddress,
  validateField,
  type AddressErrors,
  type AddressField,
  type ShippingAddress,
} from '@/domain/address';
import { splitName } from '@/domain/auth';
import { useAuth } from '@/state/AuthProvider';
import { useCheckout } from '@/state/CheckoutProvider';
import styles from './CheckoutStep.module.css';

export const fieldId = (field: AddressField) => `checkout-${field}`;

const STATE_OPTIONS = US_STATES.map((state) => ({ value: state.code, label: state.name }));

/**
 * Contact and shipping address. Each field is checked when the shopper
 * leaves it; submitting checks them all and lists any problems at the top.
 */
export function AddressStep() {
  const navigate = useNavigate();
  const { draft, saveAddress } = useCheckout();
  const { user } = useAuth();
  const [values, setValues] = useState<ShippingAddress>(draft.address);

  // A signed-in shopper gets their name and email filled in, once the session has loaded,
  // and only into fields that are still empty.
  useEffect(() => {
    if (!user) return;
    setValues((current) => ({
      ...current,
      email: current.email || user.email,
      ...(!current.firstName && !current.lastName && splitName(user.name)),
    }));
  }, [user]);
  const [errors, setErrors] = useState<AddressErrors>({});
  const [summary, setSummary] = useState<{ fieldId: string; message: string }[]>([]);
  const summaryRef = useRef<HTMLDivElement>(null);
  // Bumped by every failed submit, so focus returns to the summary even if its content didn't change.
  const [failedSubmits, setFailedSubmits] = useState(0);

  useEffect(() => {
    if (failedSubmits > 0) summaryRef.current?.focus();
  }, [failedSubmits]);

  function checkField(field: AddressField, next: ShippingAddress) {
    const message = validateField(field, normalizeAddress(next));
    setErrors((current) => {
      const updated = { ...current };
      if (message) updated[field] = message;
      else delete updated[field];
      return updated;
    });
  }

  function change(field: AddressField, value: string) {
    const next = { ...values, [field]: value };
    setValues(next);
    // Once a field has shown an error, re-check it as the shopper fixes it.
    if (errors[field]) checkField(field, next);
    // The ZIP check depends on the state.
    if (field === 'state' && (errors.zip || values.zip)) checkField('zip', next);
  }

  function blur(field: AddressField) {
    // Don't nag about a required field the shopper merely tabbed through before typing anything.
    if (!values[field] && !errors[field]) return;
    checkField(field, values);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const found = validateAddress(values);
    setErrors(found);
    const list = ADDRESS_FIELDS.filter((field) => found[field]).map((field) => ({
      fieldId: fieldId(field),
      message: found[field]!,
    }));
    setSummary(list);
    if (list.length > 0) {
      setFailedSubmits((count) => count + 1);
      return;
    }
    saveAddress(values);
    navigate('/checkout/delivery');
  }

  function field(name: AddressField, label: string, props: Partial<Parameters<typeof TextField>[0]> = {}) {
    return (
      <TextField
        id={fieldId(name)}
        label={label}
        value={values[name]}
        error={errors[name]}
        onChange={(event) => change(name, event.target.value)}
        onBlur={() => blur(name)}
        {...props}
      />
    );
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate aria-labelledby="address-step-title">
      <h2 id="address-step-title" className={styles.title}>
        <HeadingIcon icon={MapPin} />
        Contact and shipping
      </h2>
      <ErrorSummary ref={summaryRef} errors={summary} />

      <fieldset className={styles.group}>
        <legend className={styles.legend}>
          <HeadingIcon icon={Mail} />
          Contact
        </legend>
        {field('email', 'Email', {
          type: 'email',
          autoComplete: 'email',
          required: true,
          hint: "We'll send your receipt and tracking here.",
        })}
        {field('phone', 'Phone (optional)', {
          type: 'tel',
          autoComplete: 'tel-national',
          hint: 'Only used if the courier needs to reach you.',
        })}
      </fieldset>

      <fieldset className={styles.group}>
        <legend className={styles.legend}>
          <HeadingIcon icon={House} />
          Shipping address
        </legend>
        <div className={styles.row2}>
          {field('firstName', 'First name', { autoComplete: 'given-name', required: true })}
          {field('lastName', 'Last name', { autoComplete: 'family-name', required: true })}
        </div>
        {field('line1', 'Street address', { autoComplete: 'address-line1', required: true })}
        {field('line2', 'Apartment, suite, etc. (optional)', { autoComplete: 'address-line2' })}
        <div className={styles.row3}>
          {field('city', 'City', { autoComplete: 'address-level2', required: true })}
          <SelectField
            id={fieldId('state')}
            label="State"
            placeholder="Choose a state"
            options={STATE_OPTIONS}
            autoComplete="address-level1"
            required
            value={values.state}
            error={errors.state}
            onChange={(event) => change('state', event.target.value)}
            onBlur={() => blur('state')}
          />
          {field('zip', 'ZIP code', { autoComplete: 'postal-code', inputMode: 'numeric', required: true })}
        </div>
        <p className={styles.note}>We ship within the United States only.</p>
      </fieldset>

      <Button type="submit" size="lg" trailingIcon={<ArrowRight />} className={styles.submit}>
        Continue to delivery
      </Button>
    </form>
  );
}
