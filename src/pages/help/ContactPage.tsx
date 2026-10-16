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
