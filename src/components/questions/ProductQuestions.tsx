import { useId, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Clock, MessageCircleQuestion, Search, ThumbsUp } from 'lucide-react';
import { isApiError } from '@/api/client';
import { askQuestion, listQuestions, markQuestionHelpful } from '@/api/questionsApi';
import { LoadError } from '@/components/feedback/LoadError';
import { Button, HeadingIcon, Spinner, TextField } from '@/components/ui';
import type { Product } from '@/domain/product';
import { QUESTION_LIMITS, validateQuestion, type Question } from '@/domain/questions';
import { useAsync } from '@/hooks/useAsync';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { readJson, writeJson } from '@/lib/storage';
import { useAuth } from '@/state/AuthProvider';
import { useToast } from '@/state/ToastProvider';
import styles from './ProductQuestions.module.css';

const PAGE_SIZE = 5;
export const QUESTION_VOTES_KEY = 'tanelt:question-votes';
const DATE = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' });
const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string');

/** The questions section of a product page: answered questions, a search, and a way to ask. */
export function ProductQuestions({ product }: { product: Product }) {
  const { status, token } = useAuth();
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search.trim(), 200);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [voted, setVoted] = useState<string[]>(() => readJson(QUESTION_VOTES_KEY, [], isStringArray));

  const page = useAsync(
    (signal) => listQuestions(product.id, { search: debounced, limit }, token, { signal }),
    [product.id, debounced, limit, token],
  );

  function vote(question: Question) {
    if (voted.includes(question.id)) return;
    const next = [...voted, question.id];
    setVoted(next);
    writeJson(QUESTION_VOTES_KEY, next);
    markQuestionHelpful(question.id).then(page.reload, () => undefined);
  }

  const answered = page.data?.answered ?? 0;

  return (
    <section id="questions" className={styles.section} aria-labelledby="questions-title" tabIndex={-1}>
      <h2 id="questions-title" className={styles.title}>
        <HeadingIcon icon={MessageCircleQuestion} />
        Questions and answers{answered > 0 && ` (${answered})`}
      </h2>

      {answered > 0 && (
        <TextField
          label="Search questions"
          hideLabel
          type="search"
          placeholder="Search questions and answers"
          leading={<Search />}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setLimit(PAGE_SIZE);
          }}
          className={styles.search}
        />
      )}

      {page.status === 'error' ? (
        <LoadError error={page.error} onRetry={page.reload} subject="questions" />
      ) : !page.data ? (
        <Spinner label="Loading questions" />
      ) : (
        <>
          {page.data.mine.length > 0 && (
            <div className={styles.mine}>
              <h3 className={styles.subtitle}>Your questions</h3>
              <ul className={styles.list}>
                {page.data.mine.map((question) => (
                  <li key={question.id} className={styles.pending}>
                    <p className={styles.question}>{question.question}</p>
                    <p className={styles.waiting}>
                      <Clock aria-hidden="true" /> Waiting for an answer
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {answered === 0 ? (
            <p className={styles.none}>No questions about this product yet. Ask the first one.</p>
          ) : page.data.total === 0 ? (
            <p className={styles.none}>No questions match "{debounced}".</p>
          ) : (
            <>
              <p className={styles.count} aria-live="polite">
                {debounced
                  ? `${page.data.total} ${page.data.total === 1 ? 'question matches' : 'questions match'} "${debounced}"`
                  : `${page.data.total} answered ${page.data.total === 1 ? 'question' : 'questions'}`}
              </p>
              <ul className={styles.list}>
                {page.data.items.map((question) => (
                  <li key={question.id}>
                    <article className={styles.entry} aria-labelledby={`question-${question.id}`}>
                      <h3 id={`question-${question.id}`} className={styles.question}>
                        <span className={styles.marker} aria-hidden="true">
                          Q
