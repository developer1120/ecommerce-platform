import { CATALOG } from '@/data/catalog';
import { isStringArray, readJson, writeJson } from '@/lib/storage';
import { clearRecentSearches, loadRecentSearches, MAX_RECENT_SEARCHES, RECENT_SEARCHES_KEY, rememberSearch } from './recentSearches';
import { fold, highlight, queryTerms, searchCatalog } from './search';

const names = (query: string) => searchCatalog(CATALOG, query).map((product) => product.name);

describe('fold and queryTerms', () => {
  it('lowercases and strips accents without changing the length', () => {
    expect(fold('Wool Bouclé')).toBe('wool boucle');
    expect(fold('Bouclé').length).toBe('Bouclé'.length);
  });

  it('splits a query into words, dropping punctuation', () => {
    expect(queryTerms('  Linen,  NAPKIN-set! ')).toEqual(['linen', 'napkin', 'set']);
    expect(queryTerms('   ')).toEqual([]);
  });
});

describe('searchCatalog', () => {
  it('finds nothing for an empty query', () => {
    expect(names('')).toEqual([]);
  });

  it('matches names regardless of case and accents', () => {
    expect(names('BOUCLE')).toEqual(['Wool bouclé cushion']);
  });

  it('requires every word to match', () => {
    expect(names('linen napkin')).toEqual(['Linen napkin set']);
    expect(names('linen unicorn')).toEqual([]);
  });

  it('finds singular names from plural queries', () => {
    expect(names('mugs')).toContain('Stoneware mug set');
    expect(names('candles')).toContain('Beeswax taper candles');
  });

  it('ranks name matches above type, maker and tag matches', () => {
    const results = names('wool');
    // Name matches first (by review count), then products by the North Wool maker or tagged wool.
    expect(results.slice(0, 2)).toEqual(['Ribbed wool beanie', 'Wool bouclé cushion']);
    expect(results).toEqual(expect.arrayContaining(['Merino crew sweater', 'Wide-leg cord trousers']));
  });

  it('prefers a name that starts with the word over one that only contains it', () => {
    const results = names('oil');
    expect(results[0]).toBe('Camellia face oil');
  });

  it('searches makers, types, tags and option values', () => {
    expect(names('hollow kiln')).toEqual(
      expect.arrayContaining(['Stoneware mug set', 'Hand-thrown bud vase', 'Ceramic incense holder']),
    );
    expect(names('knitwear')).toEqual(['Merino crew sweater']);
    expect(names('vegan').length).toBeGreaterThan(3);
    expect(names('rosemary')).toEqual(['Solid shampoo bar']);
  });

  it('breaks ties by number of reviews', () => {
    const results = searchCatalog(CATALOG, 'gift');
    const counts = results.map((product) => product.rating.count);
    // All tag matches score the same, so reviews decide the order.
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
  });
});

describe('highlight', () => {
  it('marks every occurrence of each word', () => {
    expect(highlight('Linen napkin set', 'linen set')).toEqual([
      { text: 'Linen', match: true },
      { text: ' napkin ', match: false },
      { text: 'set', match: true },
    ]);
  });

  it('marks accented text matched without accents', () => {
    expect(highlight('Wool bouclé cushion', 'boucle')).toEqual([
      { text: 'Wool ', match: false },
      { text: 'bouclé', match: true },
      { text: ' cushion', match: false },
    ]);
  });

  it('marks the singular part of a plural query', () => {
    expect(highlight('Stoneware mug set', 'mugs')).toContainEqual({ text: 'mug', match: true });
  });

  it('returns the text unmarked without a query', () => {
    expect(highlight('Oak board', '')).toEqual([{ text: 'Oak board', match: false }]);
  });
});

describe('recent searches', () => {
  it('starts empty', () => {
    expect(loadRecentSearches()).toEqual([]);
  });

  it('keeps the newest first without case-insensitive duplicates', () => {
    rememberSearch('linen');
    rememberSearch('wool');
    expect(rememberSearch('  LINEN ')).toEqual(['LINEN', 'wool']);
    expect(loadRecentSearches()).toEqual(['LINEN', 'wool']);
  });

  it(`keeps at most ${MAX_RECENT_SEARCHES}`, () => {
    for (const term of ['a1', 'b2', 'c3', 'd4', 'e5', 'f6']) rememberSearch(term);
    expect(loadRecentSearches()).toEqual(['f6', 'e5', 'd4', 'c3', 'b2']);
  });

  it('ignores blank queries and can be cleared', () => {
    rememberSearch('oak');
    expect(rememberSearch('   ')).toEqual(['oak']);
    clearRecentSearches();
    expect(loadRecentSearches()).toEqual([]);
  });

  it('survives corrupt or unexpected storage', () => {
    localStorage.setItem(RECENT_SEARCHES_KEY, '{not json');
    expect(loadRecentSearches()).toEqual([]);
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify([1, 2, 3]));
    expect(loadRecentSearches()).toEqual([]);
  });
});

describe('storage helpers', () => {
  it('round-trips JSON and validates what it reads', () => {
    writeJson('tanelt:test', ['a', 'b']);
    expect(readJson('tanelt:test', [], isStringArray)).toEqual(['a', 'b']);
    expect(readJson('tanelt:missing', ['fallback'], isStringArray)).toEqual(['fallback']);
  });

  it('keeps working when storage throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    expect(() => writeJson('tanelt:test', ['x'])).not.toThrow();
    spy.mockRestore();
  });
});
