import type { Product } from './product';

/*
 * Plain keyword search over the catalog. Every word in the query has to
 * match somewhere; where it matches decides the rank. Matching ignores case
 * and accents, so "boucle" finds "bouclé".
 */

/** Folds one character to lowercase without accents, keeping one character per character. */
function foldChar(char: string): string {
  const folded = char.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return folded.length === 1 ? folded : char.toLowerCase();
}

/** Lowercase, accent-free text with the same length as the input, so match positions line up. */
export function fold(text: string): string {
  return Array.from(text, foldChar).join('');
}

export function queryTerms(query: string): string[] {
  return fold(query)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((term) => term.length > 0);
}

/** "mugs" also matches "mug", so simple plurals find their singular. */
function variantsOf(term: string): string[] {
  return term.length > 3 && term.endsWith('s') ? [term, term.slice(0, -1)] : [term];
}

function contains(field: string, term: string): boolean {
  return variantsOf(term).some((variant) => field.includes(variant));
}

const WEIGHTS = {
  nameWordStart: 15,
  name: 10,
  type: 5,
  maker: 4,
  tag: 3,
  department: 2,
  option: 2,
  summary: 1,
} as const;

interface IndexedProduct {
  product: Product;
  name: string;
  nameWords: string[];
  type: string;
  maker: string;
  tags: string[];
  department: string;
  options: string;
  summary: string;
}

function index(product: Product): IndexedProduct {
  const name = fold(product.name);
  return {
    product,
    name,
    nameWords: name.split(/[^\p{L}\p{N}]+/u),
    type: fold(product.type),
    maker: fold(product.maker),
    tags: product.tags.map(fold),
    department: fold(product.department),
    options: fold(product.options.flatMap((option) => option.values.map((value) => value.value)).join(' ')),
    summary: fold(product.summary),
  };
}

/** The best weight a single term earns on a product, or 0 if it matches nothing. */
function termScore(entry: IndexedProduct, term: string): number {
  const variants = variantsOf(term);
  if (entry.nameWords.some((word) => variants.some((variant) => word.startsWith(variant)))) return WEIGHTS.nameWordStart;
  if (contains(entry.name, term)) return WEIGHTS.name;
  if (contains(entry.type, term)) return WEIGHTS.type;
  if (contains(entry.maker, term)) return WEIGHTS.maker;
  if (entry.tags.some((tag) => contains(tag, term))) return WEIGHTS.tag;
  if (contains(entry.department, term)) return WEIGHTS.department;
  if (contains(entry.options, term)) return WEIGHTS.option;
  if (contains(entry.summary, term)) return WEIGHTS.summary;
  return 0;
}

/** Products matching every word of the query, best first. Ties go to the more reviewed product. */
export function searchCatalog(products: Product[], query: string): Product[] {
  const terms = queryTerms(query);
  if (terms.length === 0) return [];

  const scored: { product: Product; score: number }[] = [];
  for (const entry of products.map(index)) {
    let score = 0;
    let matchedAll = true;
    for (const term of terms) {
      const termWeight = termScore(entry, term);
      if (termWeight === 0) {
        matchedAll = false;
        break;
      }
      score += termWeight;
    }
    if (matchedAll) scored.push({ product: entry.product, score });
  }

  return scored
    .sort((a, b) => b.score - a.score || b.product.rating.count - a.product.rating.count)
    .map(({ product }) => product);
}

export interface TextSegment {
  text: string;
  match: boolean;
}

/** Splits text into matched and unmatched runs, for bolding the query in suggestions. */
export function highlight(text: string, query: string): TextSegment[] {
  const terms = queryTerms(query).flatMap(variantsOf);
  if (terms.length === 0 || text.length === 0) return [{ text, match: false }];

  const folded = fold(text);
  const marked = new Array<boolean>(text.length).fill(false);
  for (const term of terms) {
    let from = folded.indexOf(term);
    while (from !== -1) {
      marked.fill(true, from, from + term.length);
      from = folded.indexOf(term, from + term.length);
    }
  }

  const segments: TextSegment[] = [];
  for (let i = 0; i < text.length; i++) {
    const last = segments[segments.length - 1];
    if (last && last.match === marked[i]) last.text += text[i];
    else segments.push({ text: text[i]!, match: marked[i]! });
  }
  return segments;
}

export const POPULAR_SEARCHES = ['linen', 'ceramic', 'gift', 'wool', 'candle'];
