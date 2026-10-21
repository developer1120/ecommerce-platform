import { fold, queryTerms } from './search';

/*
 * Shoppers' questions about a product, and the studio's answers. Only
 * answered questions are shown to everyone; whoever asked can see their
 * own while it waits for an answer.
 */

export interface Answer {
  text: string;
  /** Who answered, e.g. "The Tanelt studio". */
  by: string;
  answeredAt: string;
}

export interface Question {
  id: string;
  productId: string;
  question: string;
  /** Shown as first name and initial, like reviews. */
  askedBy: string;
  askedById?: string;
  askedAt: string;
  answer?: Answer;
  helpful: number;
  /** Taken down by the studio. */
  hidden?: boolean;
}

export const QUESTION_LIMITS = { min: 10, max: 300 } as const;

export function validateQuestion(text: string): string | undefined {
  const length = text.trim().length;
  if (length === 0) return 'Write your question';
  if (length < QUESTION_LIMITS.min) return `Add a little more detail: at least ${QUESTION_LIMITS.min} characters`;
  if (length > QUESTION_LIMITS.max) return `Keep your question under ${QUESTION_LIMITS.max} characters`;
  return undefined;
}

/** Collapses spacing so "Is  it\nwashable?" and "Is it washable?" read the same. */
export function tidyQuestion(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

export function sameQuestion(a: string, b: string): boolean {
  return fold(tidyQuestion(a)) === fold(tidyQuestion(b));
}

/** Questions whose question or answer contains every word searched for. */
export function searchQuestions(questions: Question[], query: string): Question[] {
  const terms = queryTerms(query);
  if (terms.length === 0) return questions;
  return questions.filter((entry) => {
    const text = fold(`${entry.question} ${entry.answer?.text ?? ''}`);
    return terms.every((term) => text.includes(term));
  });
}

export type QuestionSort = 'helpful' | 'recent';

export function sortQuestions(questions: Question[], sort: QuestionSort): Question[] {
  return [...questions].sort((a, b) =>
    sort === 'helpful' ? b.helpful - a.helpful || b.askedAt.localeCompare(a.askedAt) : b.askedAt.localeCompare(a.askedAt),
  );
}
