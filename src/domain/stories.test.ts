import { CATALOG } from '@/data/catalog';
import { JOURNAL } from '@/data/journal';
import { MAKERS } from '@/data/makers';
import {
  adjacentArticles,
  findMaker,
  formatJournalDate,
  journalTags,
  makerByName,
  productsByMaker,
  productsForBlock,
  readingMinutes,
  relatedArticles,
  sortArticles,
  type JournalArticle,
} from './stories';

const article = (slug: string, publishedAt: string, tags: string[], maker?: string): JournalArticle => ({
  slug,
  title: slug,
  dek: '',
  author: 'Studio',
  publishedAt,
  tags,
  ...(maker && { maker }),
  art: { tint: 'sage', motif: 'cup' },
  body: [],
});

describe('content', () => {
  it('has a maker story for every maker in the catalog, and nobody else', () => {
    const inCatalog = [...new Set(CATALOG.map((product) => product.maker))].sort();
    expect(MAKERS.map((maker) => maker.name).sort()).toEqual(inCatalog);
    for (const name of inCatalog) expect(makerByName(MAKERS, name), name).toBeDefined();
  });

  it('only links products and makers that exist', () => {
    const ids = new Set(CATALOG.map((product) => product.id));
    for (const entry of JOURNAL) {
      if (entry.maker) expect(findMaker(MAKERS, entry.maker), entry.slug).toBeDefined();
      for (const block of entry.body) {
        if (block.type === 'products') for (const id of block.ids) expect(ids.has(id), `${entry.slug}: ${id}`).toBe(true);
      }
    }
  });

  it('uses unique slugs', () => {
    expect(new Set(JOURNAL.map((entry) => entry.slug)).size).toBe(JOURNAL.length);
    expect(new Set(MAKERS.map((maker) => maker.slug)).size).toBe(MAKERS.length);
  });
});

describe('readingMinutes', () => {
  it('counts words at 220 a minute, rounding up, ignoring product blocks', () => {
    const words = (count: number) => Array.from({ length: count }, () => 'word').join(' ');
    const base = { title: 'Title', dek: '' };
    expect(readingMinutes({ ...base, body: [] })).toBe(1);
    expect(readingMinutes({ ...base, body: [{ type: 'p', text: words(219) }] })).toBe(1);
    expect(readingMinutes({ ...base, body: [{ type: 'p', text: words(220) }] })).toBe(2);
    expect(
      readingMinutes({ ...base, body: [{ type: 'list', items: [words(300)] }, { type: 'products', ids: ['x'], caption: words(500) }] }),
    ).toBe(2);
  });
});

describe('ordering and relations', () => {
  const a = article('a', '2026-01-01', ['home']);
  const b = article('b', '2026-03-01', ['home', 'care'], 'maker');
  const c = article('c', '2026-02-01', ['care']);
  const d = article('d', '2026-04-01', ['beauty'], 'maker');

  it('sorts newest first and counts tags', () => {
    expect(sortArticles([a, b, c, d]).map((entry) => entry.slug)).toEqual(['d', 'b', 'c', 'a']);
    expect(journalTags([a, b, c, d])).toEqual([
      { tag: 'care', count: 2 },
      { tag: 'home', count: 2 },
      { tag: 'beauty', count: 1 },
    ]);
  });

  it('finds related stories by tag and maker, and the ones either side', () => {
    expect(relatedArticles(b, [a, b, c, d]).map((entry) => entry.slug)).toEqual(['d', 'c', 'a']);
    expect(relatedArticles(a, [a, b, c, d], 1).map((entry) => entry.slug)).toEqual(['b']);
    expect(adjacentArticles(b, [a, b, c, d])).toEqual({ newer: d, older: c });
    expect(adjacentArticles(d, [a, b, c, d])).toEqual({ newer: undefined, older: b });
    expect(adjacentArticles(article('x', '2026-01-01', []), [a])).toEqual({});
  });

  it('formats dates the same everywhere', () => {
    expect(formatJournalDate('2026-09-28')).toBe('September 28, 2026');
  });
});

describe('products', () => {
  it('finds a maker’s pieces and skips missing ones in a block', () => {
    expect(productsByMaker(CATALOG, { name: 'Hollow Kiln' }).map((product) => product.id)).toEqual(['hk-mug', 'hk-vase', 'hk-incense']);
    expect(productsForBlock(CATALOG, ['hk-vase', 'gone', 'hk-mug']).map((product) => product.id)).toEqual(['hk-vase', 'hk-mug']);
  });
});
