import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { ArrowRight, Mail, Monitor, Moon, Sun } from 'lucide-react';
import { Button, HeadingIcon, TextField } from '@/components/ui';
import { FOOTER_LINKS } from '@/config/navigation';
import { useTheme, type ThemePreference } from '@/theme/ThemeProvider';
import styles from './SiteFooter.module.css';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
];

function NewsletterForm() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [subscribed, setSubscribed] = useState<string | null>(null);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const value = email.trim();
    if (!value) return setError('Enter your email address');
    if (!EMAIL_PATTERN.test(value)) return setError('Enter an email address like name@example.com');
    setError(null);
    setSubscribed(value);
    setEmail('');
  }

  if (subscribed) {
    return (
      <p className={styles.thanks} role="status">
        You're on the list. Look out for a welcome note at <strong>{subscribed}</strong>.
      </p>
    );
  }

  return (
    <form className={styles.newsletter} onSubmit={handleSubmit} noValidate>
      <TextField
        label="Email address"
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
      <Button type="submit" variant="accent" trailingIcon={<ArrowRight />}>
        Subscribe
      </Button>
    </form>
  );
}

function ThemeSwitcher() {
  const { preference, setPreference } = useTheme();
  return (
    <fieldset className={styles.themeSwitcher}>
      <legend className="visually-hidden">Theme</legend>
      {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
        <label key={value} className={styles.themeOption} data-checked={preference === value || undefined}>
          <input
            type="radio"
            name="theme"
            value={value}
            checked={preference === value}
            onChange={() => setPreference(value)}
            className="visually-hidden"
          />
          <Icon aria-hidden="true" />
          {label}
        </label>
      ))}
    </fieldset>
  );
}

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <section className={styles.signup} aria-labelledby="footer-newsletter">
          <h2 id="footer-newsletter" className={styles.signupTitle}>
            <HeadingIcon icon={Mail} />
            Letters from the <em>studio</em>
          </h2>
          <p className={styles.signupText}>New arrivals, maker stories and members-only offers. Once a fortnight.</p>
          <NewsletterForm />
        </section>

        <div className={styles.columns}>
          {FOOTER_LINKS.map((group) => (
            <nav key={group.title} aria-label={group.title}>
              <h3 className={styles.columnTitle}>{group.title}</h3>
              <ul className={styles.linkList}>
                {group.links.map((link) => (
                  <li key={link.to}>
                    <Link to={link.to}>{link.label}</Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </div>

      <div className={styles.bottom}>
        <p>© {new Date().getFullYear()} Tanelt Goods Co.</p>
        <ThemeSwitcher />
      </div>
    </footer>
  );
}
