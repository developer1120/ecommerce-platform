import { CATALOG } from '@/data/catalog';
import { defineProduct, type ProductSeed } from '@/data/defineProduct';
import { clearRecentlyViewed, loadRecentlyViewed, MAX_RECENTLY_VIEWED, recordView } from './recentlyViewed';
import { countCoPurchases, recommend, similarity, WEIGHTS } from './recommendations';

function product(code: string, overrides: Partial<ProductSeed> = {}) {
  return defineProduct({
    code,
    slug: code.toLowerCase(),
    name: code,
    maker: 'Maker A',
    department: 'home',
    type: 'Tableware',
    summary: '',
    description: '',
    details: [],
    price: 3000,
    tags: [],
    rating: { average: 4.5, count: 10 },
    addedAt: '2026-01-01',
    art: { tint: 'lilac', motif: 'cup' },
    stock: 5,
    ...overrides,
  });
}

describe('similarity', () => {
  it('adds up shared traits', () => {
    const mug = product('MUG', { tags: ['ceramic', 'gift'] });
    const bowl = product('BOWL', { tags: ['ceramic'], price: 3500 });
    expect(similarity(mug, bowl)).toBe(
      WEIGHTS.sameType + WEIGHTS.sameDepartment + WEIGHTS.sameMaker + WEIGHTS.sharedTag + WEIGHTS.similarPrice,
    );
  });

  it('scores nothing for unrelated products', () => {
    const mug = product('MUG');
    const tee = product('TEE', { department: 'apparel', type: 'Tops', maker: 'Other', price: 20000 });
    expect(similarity(mug, tee)).toBe(0);
  });

  it('counts how often products were bought together', () => {
    const counts = countCoPurchases([
      { lines: [{ productId: 'a' }, { productId: 'b' }, { productId: 'b' }] },
      { lines: [{ productId: 'b' }, { productId: 'a' }] },
      { lines: [{ productId: 'a' }, { productId: 'c' }] },
    ]);
    expect(counts.get('a|b')).toBe(2);
    expect(counts.get('a|c')).toBe(1);
    expect(counts.has('b|c')).toBe(false);

    const tee = product('a', { department: 'apparel', type: 'Tops', maker: 'X', price: 99000 });
    const mug = product('b');
    expect(similarity(tee, mug, counts)).toBe(2 * WEIGHTS.boughtTogether);
  });
});

describe('recommend', () => {
  const mug = CATALOG.find((p) => p.slug === 'stoneware-mug-set')!;

  it('suggests similar in-stock products, never the product itself', () => {
    const picks = recommend([mug], CATALOG);
    expect(picks).toHaveLength(4);
    expect(picks.map((p) => p.id)).not.toContain(mug.id);
    expect(picks.every((p) => p.variants.some((v) => v.stock > 0))).toBe(true);
    // The other Hollow Kiln ceramics share maker, department and tags.
    expect(picks.map((p) => p.slug)).toEqual(expect.arrayContaining(['hand-thrown-bud-vase', 'ceramic-incense-holder']));
  });

  it('leaves out sold-out products and excluded ids', () => {
    const cushion = CATALOG.find((p) => p.slug === 'wool-boucle-cushion')!;
    const throwBlanket = CATALOG.find((p) => p.slug === 'washed-linen-throw')!;
    const picks = recommend([throwBlanket], CATALOG, { limit: 24, exclude: ['ff-napkin'] });
    expect(picks.map((p) => p.id)).not.toContain(cushion.id);
    expect(picks.map((p) => p.id)).not.toContain('ff-napkin');
  });

  it('lets purchases together lift a product up the list', () => {
    // Lip balm has little in common with a mug, until shoppers keep buying them together.
    const lipBalm = CATALOG.find((p) => p.slug === 'lip-balm-trio')!;
    expect(recommend([mug], CATALOG).map((p) => p.id)).not.toContain(lipBalm.id);
    const counts = countCoPurchases(Array.from({ length: 5 }, () => ({ lines: [{ productId: mug.id }, { productId: lipBalm.id }] })));
    expect(recommend([mug], CATALOG, { coPurchases: counts })[0]!.id).toBe(lipBalm.id);
  });

  it('blends several seeds and skips all of them', () => {
    const tee = CATALOG.find((p) => p.slug === 'organic-cotton-tee')!;
    const picks = recommend([mug, tee], CATALOG, { limit: 6 });
    expect(picks.map((p) => p.id)).not.toContain(mug.id);
    expect(picks.map((p) => p.id)).not.toContain(tee.id);
    expect(new Set(picks.map((p) => p.department)).size).toBeGreaterThan(1);
  });
});

describe('recently viewed', () => {
  it('keeps the newest first, without repeats', () => {
    recordView('a');
    recordView('b');
    expect(recordView('a')).toEqual(['a', 'b']);
  });

  it(`remembers at most ${MAX_RECENTLY_VIEWED}`, () => {
    for (let i = 0; i < 20; i++) recordView(`p${i}`);
    expect(loadRecentlyViewed()).toHaveLength(MAX_RECENTLY_VIEWED);
    expect(loadRecentlyViewed()[0]).toBe('p19');
  });

  it('can be cleared', () => {
    recordView('a');
    clearRecentlyViewed();
    expect(loadRecentlyViewed()).toEqual([]);
  });
});
