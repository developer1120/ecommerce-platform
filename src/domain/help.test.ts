import { MAX_FAILED_SIGN_INS, LOCKOUT_MS } from '@/api/authApi';
import { FREE_SHIPPING_THRESHOLD } from '@/config/store';
import { HELP_TOPICS } from '@/data/helpArticles';
import { formatMoney } from './money';
import { RETURN_WINDOW_DAYS } from './returns';
import { REMOTE_SURCHARGE, SHIPPING_METHODS } from './shipping';
import { findHelpTopic, helpPath, isHelpVotes, popularQuestions, searchHelp } from './help';

const answerText = (id: string) =>
  HELP_TOPICS.flatMap((topic) => topic.articles)
    .find((article) => article.id === id)!
    .answer.join(' ');

describe('searchHelp', () => {
  it('ranks a match in the question above one in the answer', () => {
    const results = searchHelp(HELP_TOPICS, 'refund');
    expect(results[0]!.article.id).toBe('refund-timing');
    expect(results[0]!.topic).toEqual({ slug: 'returns', title: 'Returns and refunds' });
    expect(results.map((match) => match.article.id)).toContain('damaged');
  });

  it('needs every word, ignores case and accents, and finds plurals', () => {
    expect(searchHelp(HELP_TOPICS, 'WASH Linen').map((match) => match.article.id)).toEqual(['care-linen']);
    expect(searchHelp(HELP_TOPICS, 'linen spaceship')).toEqual([]);
    expect(searchHelp(HELP_TOPICS, 'returns').length).toBeGreaterThan(0);
    expect(searchHelp(HELP_TOPICS, 'café')).toEqual(searchHelp(HELP_TOPICS, 'cafe'));
  });

  it('uses keywords for words the answer never says', () => {
    expect(searchHelp(HELP_TOPICS, 'coupon').map((match) => match.article.id)).toEqual(['promo-codes']);
  });

  it('keeps ties in help-centre order and respects the limit', () => {
    const all = searchHelp(HELP_TOPICS, 'the', 100);
    expect(all.length).toBeGreaterThan(3);
    expect(searchHelp(HELP_TOPICS, 'the', 3)).toEqual(all.slice(0, 3));
    expect(searchHelp(HELP_TOPICS, '   ')).toEqual([]);
  });
});

describe('help content', () => {
  it('has unique slugs and answer ids, so links and anchors are stable', () => {
    const ids = HELP_TOPICS.flatMap((topic) => topic.articles.map((article) => article.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(HELP_TOPICS.map((topic) => topic.slug)).size).toBe(HELP_TOPICS.length);
    // "contact" is the form's own address under /help.
    expect(findHelpTopic(HELP_TOPICS, 'contact')).toBeUndefined();
  });

  it('quotes the shop’s real prices, limits and windows', () => {
    expect(answerText('free-shipping')).toContain(formatMoney(FREE_SHIPPING_THRESHOLD).replace('.00', ''));
    for (const method of SHIPPING_METHODS) expect(answerText('shipping-options')).toContain(formatMoney(method.price));
    expect(answerText('remote-areas')).toContain(formatMoney(REMOTE_SURCHARGE).replace('.00', ''));
    expect(answerText('return-window')).toContain(`${RETURN_WINDOW_DAYS} days`);
    expect(answerText('locked-out')).toContain(`${['zero', 'one', 'two', 'three', 'four', 'five'][MAX_FAILED_SIGN_INS]} wrong passwords`);
    expect(answerText('locked-out')).toContain(`${LOCKOUT_MS / 60_000} minutes`);
  });
});

describe('helpers', () => {
  it('builds links and picks the first question of each topic', () => {
    expect(helpPath('returns')).toBe('/help/returns');
    expect(helpPath('returns', 'start-return')).toBe('/help/returns#start-return');
    expect(popularQuestions(HELP_TOPICS).map((match) => match.topic.slug)).toEqual(HELP_TOPICS.map((topic) => topic.slug));
  });

  it('accepts only saved votes', () => {
    expect(isHelpVotes({ dispatch: 'yes', cards: 'no' })).toBe(true);
    expect(isHelpVotes({ dispatch: 'maybe' })).toBe(false);
    expect(isHelpVotes(['yes'])).toBe(false);
    expect(isHelpVotes(null)).toBe(false);
  });
});
