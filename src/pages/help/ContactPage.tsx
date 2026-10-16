import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { CircleCheck, Mail, Send } from 'lucide-react';
import { isApiError } from '@/api/client';
import { REPLY_WITHIN, submitContact } from '@/api/supportApi';
import { ErrorSummary } from '@/components/checkout/ErrorSummary';
import { Breadcrumbs } from '@/components/navigation/Breadcrumbs';
import { Button, HeadingIcon, TextAreaField, TextField } from '@/components/ui';
import { HELP_TOPICS } from '@/data/helpArticles';
import { helpPath } from '@/domain/help';
import {
  EMPTY_CONTACT,
  isSupportTopic,
  MESSAGE_MAX,
  ORDER_TOPICS,
  SUBJECT_MAX,
  SUPPORT_TOPICS,
  validateContact,
  type ContactErrors,
  type ContactForm,
  type SupportTicket,
} from '@/domain/support';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useAuth } from '@/state/AuthProvider';
import styles from './Help.module.css';

/** Field order, for the error summary and for focusing the first problem. */
const FIELDS: (keyof ContactForm)[] = ['name', 'email', 'topic', 'orderId', 'subject', 'message'];
const fieldId = (field: keyof ContactForm) => `contact-${field}`;

/** Answers worth a look before writing in; most messages are about these. */
const QUICK_ANSWERS = [
  { topic: 'returns', id: 'start-return' },
  { topic: 'shipping', id: 'late-parcel' },
  { topic: 'orders', id: 'change-order' },
  { topic: 'returns', id: 'refund-timing' },
];

export function ContactPage() {
  usePageTitle('Contact us');
  const { user, token } = useAuth();
  const [params] = useSearchParams();
  const [form, setForm] = useState<ContactForm>(() => {
    const topic = params.get('topic') ?? '';
    return {
      ...EMPTY_CONTACT,
      name: user?.name ?? '',
      email: user?.email ?? '',
      topic: isSupportTopic(topic) ? topic : '',
      orderId: params.get('order') ?? '',
    };
  });
  const [errors, setErrors] = useState<ContactErrors>({});
  const [showSummary, setShowSummary] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<SupportTicket | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  // The session may still be checking when the page opens; fill in the shopper once it's known, without overwriting typing.
  useEffect(() => {
    if (!user) return;
    setForm((current) => ({ ...current, name: current.name || user.name, email: current.email || user.email }));
  }, [user]);

  const askOrder = form.topic !== '' && ORDER_TOPICS.includes(form.topic);

  function change<K extends keyof ContactForm>(field: K, value: ContactForm[K]) {
    setForm((current) => ({ ...current, [field]: value }));
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    // The order number only counts for topics that ask for it.
    const submission = askOrder ? form : { ...form, orderId: '' };
    const found = validateContact(submission);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setShowSummary(true);
      requestAnimationFrame(() => summaryRef.current?.focus());
      return;
    }
    setShowSummary(false);
    setSending(true);
    try {
      setSent(await submitContact(token, submission));
    } catch (error) {
      setFormError(isApiError(error) ? error.message : "We couldn't send your message. Try again in a moment.");
    } finally {
      setSending(false);
    }
  }

  const summary = FIELDS.filter((field) => errors[field]).map((field) => ({ fieldId: fieldId(field), message: errors[field]! }));

  return (
    <div className={styles.page}>
      <Breadcrumbs trail={[{ label: 'Help centre', to: '/help' }, { label: 'Contact us' }]} />
      <div className={styles.topicLayout}>
        <section aria-labelledby="contact-title" className={styles.block}>
          <header className={styles.topicHeader}>
            <h1 id="contact-title" className={styles.title}>
              <HeadingIcon icon={Mail} badge />
              Contact us
            </h1>
            <p className={styles.lede}>
              Write to the studio and a real person will reply within {REPLY_WITHIN}, Monday to Friday.
            </p>
          </header>

          {sent ? (
            <div className={styles.sent} role="status">
              <CircleCheck className={styles.sentIcon} aria-hidden="true" />
              <h2 className={styles.sectionTitle}>Message sent</h2>
              <p>
                Your reference is <strong>{sent.id}</strong>. We've emailed a copy to <strong>{sent.email}</strong>, and we'll reply
                there within {REPLY_WITHIN}.
              </p>
              {sent.customerId ? (
                <Link to={`/account/messages/${sent.id}`} className={styles.promptLink}>
                  See the conversation
                </Link>
              ) : (
                <Link to="/help" className={styles.promptLink}>
                  Back to the help centre
                </Link>
              )}
            </div>
          ) : (
            <form className={styles.contactForm} onSubmit={handleSubmit} noValidate aria-describedby={formError ? 'contact-error' : undefined}>
              {showSummary && <ErrorSummary ref={summaryRef} errors={summary} />}
              {formError && (
                <p id="contact-error" className={styles.formError} role="alert">
                  {formError}
                </p>
              )}
              <div className={styles.pair}>
                <TextField
                  id={fieldId('name')}
                  label="Your name"
                  autoComplete="name"
                  value={form.name}
                  error={errors.name}
                  onChange={(event) => change('name', event.target.value)}
                />
                <TextField
                  id={fieldId('email')}
                  label="Email"
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  error={errors.email}
                  hint="We'll reply here."
                  onChange={(event) => change('email', event.target.value)}
                />
              </div>

              <fieldset className={styles.topicChoice} aria-describedby={errors.topic ? 'contact-topic-error' : undefined}>
                <legend className={styles.legend}>What is it about?</legend>
                <div className={styles.topicOptions}>
                  {SUPPORT_TOPICS.map((option, index) => (
                    <label key={option.value} className={styles.topicOption}>
                      <input
                        // The first option carries the id, so the error summary can jump to the group.
                        id={index === 0 ? fieldId('topic') : undefined}
                        type="radio"
                        name="topic"
                        value={option.value}
                        checked={form.topic === option.value}
                        aria-invalid={errors.topic ? true : undefined}
                        onChange={() => change('topic', option.value)}
                      />
                      <span>
                        <span className={styles.optionLabel}>{option.label}</span>
                        <span className={styles.muted}>{option.hint}</span>
                      </span>
                    </label>
                  ))}
                </div>
                {errors.topic && (
                  <p id="contact-topic-error" className={styles.fieldError}>
                    {errors.topic}
                  </p>
                )}
              </fieldset>

              {askOrder && (
                <TextField
                  id={fieldId('orderId')}
                  label="Order number (optional)"
                  placeholder="OR-261011-K7F3"
                  autoCapitalize="characters"
                  value={form.orderId}
                  error={errors.orderId}
                  hint="It's in your confirmation email and under Your account → Orders."
                  onChange={(event) => change('orderId', event.target.value)}
                />
              )}
              <TextField
                id={fieldId('subject')}
                label="Subject"
                maxLength={SUBJECT_MAX}
                value={form.subject}
                error={errors.subject}
                onChange={(event) => change('subject', event.target.value)}
              />
              <TextAreaField
                id={fieldId('message')}
                label="Message"
                rows={7}
                maxLength={MESSAGE_MAX}
                showCount
                value={form.message}
                error={errors.message}
                onChange={(event) => change('message', event.target.value)}
              />
              <Button type="submit" size="lg" loading={sending} leadingIcon={<Send />} className={styles.submit}>
                Send message
              </Button>
            </form>
          )}
        </section>

        <aside className={styles.aside}>
          <section className={styles.prompt} aria-labelledby="quick-answers-title">
            <h2 id="quick-answers-title" className={styles.promptTitle}>
              Quick answers
            </h2>
            <ul className={styles.questionList}>
              {QUICK_ANSWERS.map(({ topic, id }) => {
                const article = HELP_TOPICS.find((candidate) => candidate.slug === topic)?.articles.find((candidate) => candidate.id === id);
                return (
                  article && (
                    <li key={id}>
                      <Link to={helpPath(topic, id)}>{article.question}</Link>
                    </li>
                  )
                );
              })}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
