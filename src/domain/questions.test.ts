import { SEED_QUESTIONS } from '@/data/questions';
import { CATALOG } from '@/data/catalog';
import { sameQuestion, searchQuestions, sortQuestions, tidyQuestion, validateQuestion, type Question } from './questions';

const question = (overrides: Partial<Question>): Question => ({
  id: 'q',
  productId: 'hk-mug',
  question: 'Is it dishwasher safe?',
  askedBy: 'Ada L.',
  askedAt: '2026-10-01T00:00:00Z',
  helpful: 0,
  ...overrides,
});

describe('validateQuestion', () => {
  it('needs a real question of a sensible length', () => {
    expect(validateQuestion('   ')).toBe('Write your question');
    expect(validateQuestion('Why?')).toBe('Add a little more detail: at least 10 characters');
    expect(validateQuestion('x'.repeat(301))).toBe('Keep your question under 300 characters');
    expect(validateQuestion('Is it dishwasher safe?')).toBeUndefined();
  });
});

describe('tidying and comparing questions', () => {
  it('collapses spacing, and matches regardless of case and accents', () => {
    expect(tidyQuestion('  Is  it\nwashable? ')).toBe('Is it washable?');
    expect(sameQuestion('Is the BOUCLÉ soft?', ' is the  boucle soft? ')).toBe(true);
    expect(sameQuestion('Is it soft?', 'Is it warm?')).toBe(false);
  });
});

describe('searchQuestions', () => {
  const list = [
    question({ id: 'a', question: 'Is it dishwasher safe?', answer: { text: 'Yes, and microwave safe.', by: 'Studio', answeredAt: '' } }),
    question({ id: 'b', question: 'How big is it?', answer: { text: 'About 350 ml.', by: 'Studio', answeredAt: '' } }),
  ];

  it('looks in questions and answers for every word', () => {
    expect(searchQuestions(list, 'microwave').map((entry) => entry.id)).toEqual(['a']);
    expect(searchQuestions(list, 'how 350').map((entry) => entry.id)).toEqual(['b']);
    expect(searchQuestions(list, 'how microwave')).toEqual([]);
    expect(searchQuestions(list, '  ')).toBe(list);
  });
});

describe('sortQuestions', () => {
  it('puts the most helpful first, newest breaking ties, or simply newest first', () => {
    const list = [
      question({ id: 'old-popular', helpful: 9, askedAt: '2026-01-01T00:00:00Z' }),
      question({ id: 'new', helpful: 1, askedAt: '2026-09-01T00:00:00Z' }),
      question({ id: 'tie-newer', helpful: 9, askedAt: '2026-05-01T00:00:00Z' }),
    ];
    expect(sortQuestions(list, 'helpful').map((entry) => entry.id)).toEqual(['tie-newer', 'old-popular', 'new']);
    expect(sortQuestions(list, 'recent').map((entry) => entry.id)).toEqual(['new', 'tie-newer', 'old-popular']);
  });
});

describe('seeded questions', () => {
  it('are answered, unique and about products in the catalog', () => {
    const ids = new Set(CATALOG.map((product) => product.id));
    expect(new Set(SEED_QUESTIONS.map((entry) => entry.id)).size).toBe(SEED_QUESTIONS.length);
    for (const entry of SEED_QUESTIONS) {
      expect(ids.has(entry.productId)).toBe(true);
      expect(entry.answer?.text.length).toBeGreaterThan(0);
      expect(validateQuestion(entry.question)).toBeUndefined();
    }
  });
});
