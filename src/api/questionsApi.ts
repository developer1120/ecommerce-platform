import { CATALOG } from '@/data/catalog';
import { SEED_QUESTIONS } from '@/data/questions';
import {
  searchQuestions,
  sameQuestion,
  sortQuestions,
  tidyQuestion,
  validateQuestion,
  type Question,
  type QuestionSort,
} from '@/domain/questions';
import { displayName } from '@/domain/reviews';
import { randomHex } from '@/lib/crypto';
import { readJson, writeJson } from '@/lib/storage';
import { findUser, requireAdmin, userForToken } from './authApi';
import { ApiError, simulateRequest, type RequestOptions } from './client';
import { sendEmails } from './outbox';

export const QUESTIONS_KEY = 'tanelt:mock-db:questions';

const isArray = (value: unknown): value is unknown[] => Array.isArray(value);
/** Questions asked in this shop, newest first; the seeded ones are separate. */
const asked = (): Question[] => readJson(QUESTIONS_KEY, [], isArray) as Question[];
export const saveAsked = (list: Question[]) => writeJson(QUESTIONS_KEY, list);

/** Helpful votes on seeded questions, which aren't stored anywhere else. */
const seedVotes = new Map<string, number>();

/** Every question, seeded and asked, with seed votes applied. */
export function allQuestions(): Question[] {
  const seeded = SEED_QUESTIONS.map((question) => ({ ...question, helpful: question.helpful + (seedVotes.get(question.id) ?? 0) }));
  return [...asked(), ...seeded];
}

export interface QuestionQuery {
  search?: string;
  sort?: QuestionSort;
  limit?: number;
}

export interface QuestionPage {
  /** Answered questions matching the search, up to the limit. */
  items: Question[];
  /** All answered questions matching the search, for "show more". */
  total: number;
  /** Answered questions on the product, whatever the search. */
  answered: number;
  /** The signed-in shopper's own questions still waiting for an answer. */
  mine: Question[];
}

export function listQuestions(
  productId: string,
  query: QuestionQuery = {},
  sessionToken?: string | null,
  options?: RequestOptions,
): Promise<QuestionPage> {
  return simulateRequest(() => {
    const forProduct = allQuestions().filter((question) => question.productId === productId && !question.hidden);
    const answered = forProduct.filter((question) => question.answer);
    const matching = sortQuestions(searchQuestions(answered, query.search ?? ''), query.sort ?? 'helpful');
    const user = userForToken(sessionToken);
    return {
      items: matching.slice(0, query.limit ?? 5),
      total: matching.length,
      answered: answered.length,
      mine: user ? forProduct.filter((question) => !question.answer && question.askedById === user.id) : [],
    };
  }, options);
}

export function askQuestion(sessionToken: string, productId: string, text: string, options?: RequestOptions): Promise<Question> {
  return simulateRequest(() => {
    const user = userForToken(sessionToken);
    if (!user) throw new ApiError('UNAUTHORIZED', 'Sign in to ask a question.');
    if (!CATALOG.some((product) => product.id === productId)) throw new ApiError('NOT_FOUND', "We couldn't find that product.");
    const problem = validateQuestion(text);
    if (problem) throw new ApiError('VALIDATION', problem);
    const duplicate = asked().some(
      (question) => question.productId === productId && question.askedById === user.id && !question.answer && sameQuestion(question.question, text),
    );
    if (duplicate) throw new ApiError('CONFLICT', "You've already asked that. We'll answer it soon.");
    const question: Question = {
      id: `q_${randomHex(6)}`,
      productId,
      question: tidyQuestion(text),
      askedBy: displayName(user.name),
      askedById: user.id,
      askedAt: new Date().toISOString(),
      helpful: 0,
    };
    saveAsked([question, ...asked()]);
    return question;
  }, options);
}

export function markQuestionHelpful(questionId: string, options?: RequestOptions): Promise<void> {
  return simulateRequest(() => {
    const stored = asked();
    const index = stored.findIndex((question) => question.id === questionId);
    if (index >= 0) {
      stored[index] = { ...stored[index]!, helpful: stored[index]!.helpful + 1 };
      saveAsked(stored);
    } else if (SEED_QUESTIONS.some((question) => question.id === questionId)) {
      seedVotes.set(questionId, (seedVotes.get(questionId) ?? 0) + 1);
    } else {
      throw new ApiError('NOT_FOUND', "We couldn't find that question.");
    }
  }, options);
}

/** Forgets votes on seeded questions. Tests call this between cases. */
export function resetQuestionServer(): void {
  seedVotes.clear();
}

/* The studio's side: answering and moderating questions shoppers asked. */

export type InboxFilter = 'unanswered' | 'answered' | 'hidden';

/** A question as the studio sees it, with the product it's about. */
export interface InboxQuestion extends Question {
  productName: string;
  productSlug: string;
}

export interface QuestionInbox {
  items: InboxQuestion[];
  counts: Record<InboxFilter, number>;
}

export const ANSWER_LIMITS = { min: 2, max: 1000 } as const;
const STUDIO = 'The Tanelt studio';

function filterOf(question: Question): InboxFilter {
  if (question.hidden) return 'hidden';
  return question.answer ? 'answered' : 'unanswered';
}

/** Questions shoppers asked (not the ones that ship with the catalog). Unanswered ones oldest first, so nobody waits longest; the rest newest first. Admins only. */
export function listQuestionInbox(token: string, filter: InboxFilter, options?: RequestOptions): Promise<QuestionInbox> {
  return simulateRequest(() => {
    requireAdmin(token);
    const all = asked();
    const counts: Record<InboxFilter, number> = { unanswered: 0, answered: 0, hidden: 0 };
    for (const question of all) counts[filterOf(question)] += 1;
    const items = all
      .filter((question) => filterOf(question) === filter)
      .sort((a, b) => (filter === 'unanswered' ? a.askedAt.localeCompare(b.askedAt) : b.askedAt.localeCompare(a.askedAt)))
      .map((question) => {
        const product = CATALOG.find((candidate) => candidate.id === question.productId);
        return { ...question, productName: product?.name ?? 'Removed product', productSlug: product?.slug ?? '' };
      });
    return { items, counts };
  }, options);
}

function updateAsked(questionId: string, change: (question: Question) => Question): Question {
  const stored = asked();
  const index = stored.findIndex((question) => question.id === questionId);
  if (index < 0) throw new ApiError('NOT_FOUND', "We couldn't find that question.");
  const updated = change(stored[index]!);
  stored[index] = updated;
  saveAsked(stored);
  return updated;
}

/**
 * Publishes the studio's answer, or replaces it. The first answer emails
 * the shopper who asked, if they still have an account. Admins only.
 */
export function answerQuestion(token: string, questionId: string, text: string, options?: RequestOptions): Promise<Question> {
  return simulateRequest(() => {
    requireAdmin(token);
    const answer = text.trim();
    if (answer.length < ANSWER_LIMITS.min) throw new ApiError('VALIDATION', 'Write an answer');
    if (answer.length > ANSWER_LIMITS.max) throw new ApiError('VALIDATION', `Keep the answer under ${ANSWER_LIMITS.max} characters`);
    let firstAnswer = false;
    const updated = updateAsked(questionId, (question) => {
      firstAnswer = !question.answer;
      return { ...question, answer: { text: answer, by: STUDIO, answeredAt: new Date().toISOString() } };
    });
    const asker = updated.askedById ? findUser(updated.askedById) : undefined;
    const product = CATALOG.find((candidate) => candidate.id === updated.productId);
    if (firstAnswer && asker && product) {
      sendEmails([
        {
          to: asker.email,
          subject: `Your question about ${product.name} was answered`,
          body: `You asked: "${updated.question}" Our answer: ${answer} See it on the product page: /product/${product.slug}#questions`,
          sentAt: new Date().toISOString(),
        },
      ]);
    }
    return updated;
  }, options);
}

/** Takes a question off the product page, or puts it back. Admins only. */
export function setQuestionHidden(token: string, questionId: string, hidden: boolean, options?: RequestOptions): Promise<Question> {
  return simulateRequest(() => {
    requireAdmin(token);
    return updateAsked(questionId, (question) => ({ ...question, hidden }));
  }, options);
}
