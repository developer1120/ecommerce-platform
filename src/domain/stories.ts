import type { Product, ProductArt } from './product';

/*
 * The shop's editorial side: the makers behind the products, and the
 * journal. Both are static content; these helpers connect them to each
 * other and to the catalog.
 */

export interface Maker {
  slug: string;
  /** Matches Product.maker exactly. */
  name: string;
  craft: string;
  place: string;
  founded: number;
  art: ProductArt;
  /** One line for cards. */
  intro: string;
  /** Paragraphs for the maker's page. */
  story: string[];
}

export type JournalBlock =
  | { type: 'p'; text: string }
  | { type: 'h'; text: string }
  | { type: 'quote'; text: string; cite: string }
  | { type: 'list'; items: string[] }
  | { type: 'products'; ids: string[]; caption: string };

export interface JournalArticle {
  slug: string;
  title: string;
  /** The standfirst under the title. */
  dek: string;
  author: string;
  /** YYYY-MM-DD. */
  publishedAt: string;
  tags: string[];
  /** The maker the article is about, if any. */
  maker?: string;
  art: ProductArt;
  body: JournalBlock[];
}

export const WORDS_PER_MINUTE = 220;

function blockText(block: JournalBlock): string {
  switch (block.type) {
    case 'list':
      return block.items.join(' ');
    case 'products':
      return '';
    case 'quote':
      return `${block.text} ${block.cite}`;
    default:
      return block.text;
  }
}

/** Minutes to read, rounded up, never less than one. Product blocks don't count. */
export function readingMinutes(article: Pick<JournalArticle, 'title' | 'dek' | 'body'>): number {
  const text = [article.title, article.dek, ...article.body.map(blockText)].join(' ');
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}

/** Newest first. */
export function sortArticles(articles: JournalArticle[]): JournalArticle[] {
  return [...articles].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.slug.localeCompare(b.slug));
}

/** Every tag in use, most used first, then alphabetical. */
export function journalTags(articles: Pick<JournalArticle, 'tags'>[]): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const article of articles) for (const tag of article.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

export const tagLabel = (tag: string) => tag.charAt(0).toUpperCase() + tag.slice(1);

/**
 * Articles to read next: those sharing the most tags (or the same maker),
 * newest first among equals. Falls back to the newest when nothing is related.
 */
export function relatedArticles(article: JournalArticle, all: JournalArticle[], limit = 3): JournalArticle[] {
  const others = sortArticles(all).filter((candidate) => candidate.slug !== article.slug);
  const score = (candidate: JournalArticle) =>
    candidate.tags.filter((tag) => article.tags.includes(tag)).length + (article.maker && candidate.maker === article.maker ? 2 : 0);
  return others
    .map((candidate, index) => ({ candidate, index, score: score(candidate) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map(({ candidate }) => candidate);
}

/** The articles either side of one in date order: newer and older. */
export function adjacentArticles(article: JournalArticle, all: JournalArticle[]): { newer?: JournalArticle; older?: JournalArticle } {
  const sorted = sortArticles(all);
  const index = sorted.findIndex((candidate) => candidate.slug === article.slug);
  if (index < 0) return {};
  return { newer: sorted[index - 1], older: sorted[index + 1] };
}

const JOURNAL_DATE = new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' });

export function formatJournalDate(date: string): string {
  return JOURNAL_DATE.format(new Date(`${date}T12:00:00Z`));
}

export function findMaker(makers: Maker[], slug: string | undefined): Maker | undefined {
  return makers.find((maker) => maker.slug === slug);
}

export function makerByName(makers: Maker[], name: string): Maker | undefined {
  return makers.find((maker) => maker.name === name);
}

/** A maker's products, in catalog order. */
export function productsByMaker(products: Product[], maker: Pick<Maker, 'name'>): Product[] {
  return products.filter((product) => product.maker === maker.name);
}

/** Products in a block that are still on sale, in the block's order. */
export function productsForBlock(products: Product[], ids: string[]): Product[] {
  return ids.map((id) => products.find((product) => product.id === id)).filter((product): product is Product => product !== undefined);
}

/** "Since 2014 · 12 years" style figures for a maker card. */
export function yearsMaking(maker: Pick<Maker, 'founded'>, now: Date): number {
  return Math.max(0, now.getUTCFullYear() - maker.founded);
}
