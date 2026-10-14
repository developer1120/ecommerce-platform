import { useId, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Eye, EyeOff, MessageCircleQuestion, Pencil, Send } from 'lucide-react';
import { isApiError } from '@/api/client';
import {
  ANSWER_LIMITS,
  answerQuestion,
  listQuestionInbox,
  setQuestionHidden,
  type InboxFilter,
  type InboxQuestion,
} from '@/api/questionsApi';
import { LoadError } from '@/components/feedback/LoadError';
import { Button, HeadingIcon, Spinner, ToggleChip } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useAuth } from '@/state/AuthProvider';
import { useToast } from '@/state/ToastProvider';
import adminStyles from './Admin.module.css';
import styles from './AdminQuestionsPage.module.css';

const FILTERS: { value: InboxFilter; label: string; empty: string }[] = [
  { value: 'unanswered', label: 'Unanswered', empty: 'Every question has an answer. Nice work.' },
  { value: 'answered', label: 'Answered', empty: 'No answered questions yet.' },
  { value: 'hidden', label: 'Hidden', empty: 'No hidden questions.' },
];

const isFilter = (value: string | null): value is InboxFilter => FILTERS.some((filter) => filter.value === value);
const DATE = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' });

/** Questions shoppers asked, to answer or take down. Unanswered ones wait longest first. */
export function AdminQuestionsPage() {
  usePageTitle('Questions · Admin');
  const { token } = useAuth();
  const [params, setParams] = useSearchParams();
  const requested = params.get('show');
  const filter: InboxFilter = isFilter(requested) ? requested : 'unanswered';
  const inbox = useAsync((signal) => listQuestionInbox(token!, filter, { signal }), [token, filter]);

  return (
    <section className={adminStyles.section} aria-labelledby="admin-questions-title">
      <div className={adminStyles.toolbar}>
        <h2 id="admin-questions-title" className={adminStyles.sectionTitle}>
          <HeadingIcon icon={MessageCircleQuestion} />
          Questions
        </h2>
      </div>
      <div className={adminStyles.chips} role="group" aria-label="Show">
        {FILTERS.map((option) => {
          const count = inbox.data?.counts[option.value];
          return (
            <ToggleChip
              key={option.value}
              selected={filter === option.value}
              accessibleLabel={count === undefined ? option.label : `${option.label}, ${count} ${count === 1 ? 'question' : 'questions'}`}
              onToggle={() => setParams(option.value === 'unanswered' ? {} : { show: option.value }, { replace: true })}
            >
              {option.label} {count !== undefined && <span className={adminStyles.count}>{count}</span>}
            </ToggleChip>
          );
        })}
      </div>

      {inbox.status === 'error' ? (
        <LoadError error={inbox.error} onRetry={inbox.reload} subject="questions" />
      ) : !inbox.data ? (
        <Spinner label="Loading questions" />
      ) : inbox.data.items.length === 0 ? (
        <p className={adminStyles.empty}>{FILTERS.find((option) => option.value === filter)!.empty}</p>
      ) : (
        <ul className={styles.list}>
          {inbox.data.items.map((question) => (
            <li key={question.id}>
              <QuestionCard question={question} onChanged={inbox.reload} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function QuestionCard({ question, onChanged }: { question: InboxQuestion; onChanged: () => void }) {
  const { token } = useAuth();
  const { toast } = useToast();
  const [editing, setEditing] = useState(!question.answer);
  const [draft, setDraft] = useState(question.answer?.text ?? '');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fieldId = useId();
  const helpId = useId();

  async function publish(event: FormEvent) {
    event.preventDefault();
    if (draft.trim().length < ANSWER_LIMITS.min) {
      setProblem('Write an answer');
      return;
    }
    setBusy(true);
    try {
      await answerQuestion(token!, question.id, draft);
      toast({ title: question.answer ? 'Answer updated' : 'Answer published', description: question.productName });
      setEditing(false);
      onChanged();
    } catch (error) {
      setProblem(isApiError(error) ? error.message : "We couldn't publish the answer. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleHidden() {
    setBusy(true);
    try {
      await setQuestionHidden(token!, question.id, !question.hidden);
      toast({ tone: 'info', title: question.hidden ? 'Question shown' : 'Question hidden', description: question.question });
      onChanged();
    } catch (error) {
      toast({ tone: 'error', title: "Couldn't update the question", description: isApiError(error) ? error.message : undefined });
      setBusy(false);
    }
  }

  return (
    <article className={styles.card} aria-labelledby={`inbox-${question.id}`} data-hidden={question.hidden || undefined}>
      <p className={styles.product}>
        {question.productSlug ? <Link to={`/product/${question.productSlug}#questions`}>{question.productName}</Link> : question.productName}
      </p>
      <h3 id={`inbox-${question.id}`} className={styles.question}>
        {question.question}
      </h3>
      <p className={adminStyles.muted}>
        Asked by {question.askedBy} · {DATE.format(new Date(question.askedAt))}
      </p>

      {question.answer && !editing && (
        <div className={styles.answer}>
          <p>{question.answer.text}</p>
          <p className={adminStyles.muted}>Answered {DATE.format(new Date(question.answer.answeredAt))}</p>
        </div>
      )}

      {editing && !question.hidden ? (
        <form className={styles.form} onSubmit={publish} noValidate>
          <label htmlFor={fieldId} className={styles.label}>
            {question.answer ? 'Edit the answer' : 'Your answer'}
          </label>
          <textarea
            id={fieldId}
            className={styles.textarea}
            rows={3}
            value={draft}
            maxLength={ANSWER_LIMITS.max}
            aria-invalid={problem ? true : undefined}
            aria-describedby={helpId}
            onChange={(event) => {
              setDraft(event.target.value);
              if (problem) setProblem(null);
            }}
          />
          <p id={helpId} className={problem ? styles.error : styles.hint}>
            {problem ?? 'Shown on the product page as from the Tanelt studio. The shopper is emailed the first answer.'}
          </p>
          <div className={styles.actions}>
            <Button type="submit" size="sm" leadingIcon={<Send />} loading={busy}>
              {question.answer ? 'Save answer' : 'Publish answer'}
            </Button>
            {question.answer && (
              <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      ) : null}

      <div className={styles.actions}>
        {question.answer && !editing && !question.hidden && (
          <Button variant="secondary" size="sm" leadingIcon={<Pencil />} onClick={() => setEditing(true)}>
            Edit answer
          </Button>
        )}
        <Button variant="ghost" size="sm" leadingIcon={question.hidden ? <Eye /> : <EyeOff />} disabled={busy} onClick={() => void toggleHidden()}>
          {question.hidden ? 'Show' : 'Hide'}
        </Button>
      </div>
    </article>
  );
}
