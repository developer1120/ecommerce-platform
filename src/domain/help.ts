import { fold, queryTerms } from './search';

/*
 * The help centre: answers grouped into topics, and a search across them
 * that ranks a question match above a match in the answer text.
 */

export interface HelpArticle {
  /** Also the anchor on the topic page, e.g. /help/shipping#free-shipping. */
  id: string;
  question: string;
  /** Paragraphs. */
  answer: string[];
  /** Words people search with that may not appear in the text, like "coupon" for promo codes. */
  keywords: string[];
}

export interface HelpTopic {
  slug: string;
  title: string;
  summary: string;
  articles: HelpArticle[];
}

export interface HelpMatch {
  topic: Pick<HelpTopic, 'slug' | 'title'>;
  article: HelpArticle;
  score: number;
}

export const helpPath = (topicSlug: string, articleId?: string) => `/help/${topicSlug}${articleId ? `#${articleId}` : ''}`;

export function findHelpTopic(topics: HelpTopic[], slug: string | undefined): HelpTopic | undefined {
  return topics.find((topic) => topic.slug === slug);
}

const QUESTION_WEIGHT = 4;
const KEYWORD_WEIGHT = 3;
const ANSWER_WEIGHT = 1;

/** How well one article matches the query terms; 0 means at least one term is missing. */
function scoreArticle(article: HelpArticle, terms: string[]): number {
  const question = fold(article.question);
  const keywords = article.keywords.map(fold);
  const answer = fold(article.answer.join(' '));
  let score = 0;
  for (const term of terms) {
    // "returns" should find "return", as in the shop search.
    const stem = term.length > 3 && term.endsWith('s') ? term.slice(0, -1) : term;
    let best = 0;
    if (question.includes(stem)) best = QUESTION_WEIGHT;
    else if (keywords.some((keyword) => keyword.includes(stem))) best = KEYWORD_WEIGHT;
    else if (answer.includes(stem)) best = ANSWER_WEIGHT;
    if (best === 0) return 0;
    score += best;
  }
  return score;
}

/**
 * Articles that mention every word of the query, best first. Ties keep
 * the help centre's own order, which puts the commonest questions first.
 */
export function searchHelp(topics: HelpTopic[], query: string, limit = 8): HelpMatch[] {
  const terms = queryTerms(query);
  if (terms.length === 0) return [];
  const matches: HelpMatch[] = [];
  for (const topic of topics) {
    for (const article of topic.articles) {
      const score = scoreArticle(article, terms);
      if (score > 0) matches.push({ topic: { slug: topic.slug, title: topic.title }, article, score });
    }
  }
  return matches
    .map((match, index) => ({ match, index }))
    .sort((a, b) => b.match.score - a.match.score || a.index - b.index)
    .slice(0, limit)
    .map(({ match }) => match);
}

/** The first few questions of each topic, for the help centre's front page. */
export function popularQuestions(topics: HelpTopic[], perTopic = 1): HelpMatch[] {
  return topics.flatMap((topic) =>
    topic.articles.slice(0, perTopic).map((article) => ({ topic: { slug: topic.slug, title: topic.title }, article, score: 0 })),
  );
}

/** Answers marked helpful or not, remembered on this device so a shopper votes once. */
export type HelpVote = 'yes' | 'no';
export const HELP_VOTES_KEY = 'tanelt:help-votes';

export function isHelpVotes(value: unknown): value is Record<string, HelpVote> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((vote) => vote === 'yes' || vote === 'no')
  );
}
