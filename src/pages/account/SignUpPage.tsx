import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { CircleAlert } from 'lucide-react';
import { isApiError } from '@/api/client';
import { Button, TextField } from '@/components/ui';
import { PasswordField } from '@/components/ui/PasswordField';
import {
  MIN_PASSWORD_LENGTH,
  passwordStrength,
  safeRedirect,
  splitName,
  validateEmail,
  validateName,
  validateNewPassword,
} from '@/domain/auth';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useAuth } from '@/state/AuthProvider';
import { useToast } from '@/state/ToastProvider';
import { AuthLayout } from './AuthLayout';
import styles from './AuthPage.module.css';

const STRENGTH_LABEL = { weak: 'Too weak', fair: 'Good', strong: 'Strong' } as const;

export function SignUpPage() {
  usePageTitle('Create an account');
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeRedirect(params.get('next'));
  const { status, signUp } = useAuth();
  const { toast } = useToast();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; email?: string; password?: string }>({});
  const [failure, setFailure] = useState<{ message: string; existing: boolean } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (status === 'signed-in' && !submitting) return <Navigate to={next} replace />;

  const strength = password ? passwordStrength(password) : null;
  const signInLink = `/account/sign-in${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const found = {
      name: validateName(name),
      email: validateEmail(email),
      password: validateNewPassword(password, email),
    };
    setErrors(found);
    if (found.name || found.email || found.password) return;

    setSubmitting(true);
    setFailure(null);
    try {
      const user = await signUp({ name, email, password, remember });
      toast({ title: `Welcome to Tanelt, ${splitName(user.name).firstName}` });
      navigate(next, { replace: true });
    } catch (error) {
      setSubmitting(false);
      setFailure({
        message: isApiError(error) ? error.message : "We couldn't create your account. Try again in a moment.",
        existing: isApiError(error) && error.code === 'CONFLICT',
      });
    }
  }

  return (
    <AuthLayout title="Create an account" intro="Track orders, save addresses and keep a wishlist.">
      {failure && (
        <div className={styles.alert} role="alert">
          <CircleAlert aria-hidden="true" />
          <span>
            {failure.message} {failure.existing && <Link to={signInLink}>Go to sign in</Link>}
          </span>
        </div>
      )}
      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <TextField
          label="Your name"
          autoComplete="name"
          value={name}
          error={errors.name}
          onChange={(event) => setName(event.target.value)}
        />
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          error={errors.email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <PasswordField
          label="Password"
          autoComplete="new-password"
          hint={`At least ${MIN_PASSWORD_LENGTH} characters. A short phrase is easy to remember and hard to guess.`}
          value={password}
          error={errors.password}
          onChange={(event) => {
            setPassword(event.target.value);
            if (errors.password) setErrors((current) => ({ ...current, password: undefined }));
          }}
        />
        {strength && (
          <p className={styles.strength} data-strength={strength} aria-live="polite">
            <span className={styles.meter} aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            Password strength: {STRENGTH_LABEL[strength]}
          </p>
        )}
        <label className={styles.check}>
          <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
          Keep me signed in on this device
        </label>
        <Button type="submit" size="lg" block loading={submitting}>
          Create account
        </Button>
      </form>
      <p className={styles.switch}>
        Already have an account? <Link to={signInLink}>Sign in</Link>
      </p>
    </AuthLayout>
  );
}
