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
