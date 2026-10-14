import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { CircleAlert } from 'lucide-react';
import { isApiError } from '@/api/client';
import { Button, TextField } from '@/components/ui';
import { PasswordField } from '@/components/ui/PasswordField';
import { safeRedirect, splitName, validateEmail } from '@/domain/auth';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useAuth } from '@/state/AuthProvider';
import { useToast } from '@/state/ToastProvider';
import { AuthLayout } from './AuthLayout';
import styles from './AuthPage.module.css';

export function SignInPage() {
  usePageTitle('Sign in');
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeRedirect(params.get('next'));
  const { status, signIn } = useAuth();
  const { toast } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (status === 'signed-in' && !submitting) return <Navigate to={next} replace />;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const found = {
      email: validateEmail(email),
      password: password ? undefined : 'Enter your password',
    };
    setErrors(found);
    if (found.email || found.password) return;

    setSubmitting(true);
    setFailure(null);
    try {
      const user = await signIn({ email, password, remember });
      toast({ title: `Welcome back, ${splitName(user.name).firstName}` });
      navigate(next, { replace: true });
    } catch (error) {
      setSubmitting(false);
      setPassword('');
      setFailure(isApiError(error) ? error.message : "We couldn't sign you in. Try again in a moment.");
    }
  }

  const signUpLink = `/account/sign-up${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`;

  return (
    <AuthLayout title="Sign in" intro="Welcome back. Pick up where you left off.">
      {failure && (
        <div className={styles.alert} role="alert">
          <CircleAlert aria-hidden="true" />
          <span>{failure}</span>
        </div>
      )}
      <form className={styles.form} onSubmit={handleSubmit} noValidate>
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
          autoComplete="current-password"
          value={password}
          error={errors.password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <label className={styles.check}>
          <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
          Keep me signed in on this device
        </label>
        <Button type="submit" size="lg" block loading={submitting}>
          Sign in
        </Button>
      </form>
      <p className={styles.switch}>
        New to Tanelt? <Link to={signUpLink}>Create an account</Link>
      </p>
    </AuthLayout>
  );
}
