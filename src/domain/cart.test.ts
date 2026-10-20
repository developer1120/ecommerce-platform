import { CATALOG } from '@/data/catalog';
import {
  cartReducer,
  describeOptions,
  EMPTY_CART,
  itemCount,
  lineTotal,
  makeCartLine,
  MAX_PER_LINE,
  maxQuantity,
  savings,
  subtotal,
  type CartLine,
  type CartState,
} from './cart';
import { CART_STORAGE_KEY, CART_STORAGE_VERSION, isCartLine, loadCart, parseStoredCart, saveCart } from './cartStorage';

const NOW = new Date('2026-10-08T10:00:00Z');
const bySlug = (slug: string) => CATALOG.find((product) => product.slug === slug)!;

const mugs = bySlug('stoneware-mug-set'); // on sale: $38.40, was $48
const board = bySlug('oak-serving-board'); // Large costs $68 via a variant price
const vase = bySlug('hand-thrown-bud-vase'); // Chalk has 3 in stock

const mugLine = makeCartLine(mugs, mugs.variants[0]!, NOW); // Speckled (id hk-mug-spec), 24 in stock
const largeBoard = makeCartLine(board, board.variants[1]!, NOW);
const chalkVase = makeCartLine(vase, vase.variants[0]!, NOW);

function add(state: CartState, line: Omit<CartLine, 'quantity'>, quantity = 1) {
  return cartReducer(state, { type: 'add', line, quantity });
}

describe('makeCartLine', () => {
  it('snapshots the product, variant and sale price', () => {
    expect(mugLine).toEqual({
      variantId: 'hk-mug-spec',
      productId: 'hk-mug',
      slug: 'stoneware-mug-set',
      name: 'Stoneware mug set',
      maker: 'Hollow Kiln',
      sku: 'HK-MUG-SPEC',
      options: { Glaze: 'Speckled' },
      unitPrice: 3840,
      compareAtPrice: 4800,
      art: { tint: 'lilac', motif: 'cup' },
      swatch: '#e9e1d4',
      stock: 24,
      addedAt: '2026-10-08T10:00:00.000Z',
    });
  });

  it('uses the variant price and no compare-at price for priced variants', () => {
    expect(largeBoard.unitPrice).toBe(6800);
    expect(largeBoard).not.toHaveProperty('compareAtPrice');
    expect(largeBoard).not.toHaveProperty('swatch');
  });
});

describe('cartReducer', () => {
  it('adds a new line', () => {
    const state = add(EMPTY_CART, mugLine, 2);
    expect(state.lines).toHaveLength(1);
    expect(state.lines[0]!.quantity).toBe(2);
  });

  it('merges the same variant into one line, keeping when it was first added', () => {
    const first = add(EMPTY_CART, mugLine, 1);
    const later = { ...mugLine, addedAt: '2026-10-09T00:00:00.000Z' };
    const state = add(first, later, 2);
    expect(state.lines).toHaveLength(1);
    expect(state.lines[0]).toMatchObject({ quantity: 3, addedAt: mugLine.addedAt });
  });

  it('keeps different variants of one product on separate lines', () => {
    const small = makeCartLine(board, board.variants[0]!, NOW);
    const state = add(add(EMPTY_CART, small), largeBoard);
    expect(state.lines.map((line) => line.variantId)).toEqual(['gw-board-smal', 'gw-board-larg']);
  });

  it('caps a line at the stock on hand', () => {
    expect(add(EMPTY_CART, chalkVase, 5).lines[0]!.quantity).toBe(3);
    const twice = add(add(EMPTY_CART, chalkVase, 2), chalkVase, 2);
    expect(twice.lines[0]!.quantity).toBe(3);
  });

  it(`caps a line at ${MAX_PER_LINE} even with more stock`, () => {
    expect(add(EMPTY_CART, mugLine, 50).lines[0]!.quantity).toBe(MAX_PER_LINE);
    expect(maxQuantity({ stock: 24 })).toBe(MAX_PER_LINE);
    expect(maxQuantity({ stock: 3 })).toBe(3);
  });

  it('refuses to add something out of stock or a non-positive amount', () => {
    expect(add(EMPTY_CART, { ...chalkVase, stock: 0 })).toBe(EMPTY_CART);
    expect(add(EMPTY_CART, mugLine, 0)).toBe(EMPTY_CART);
    expect(add(EMPTY_CART, mugLine, -2)).toBe(EMPTY_CART);
    expect(add(EMPTY_CART, mugLine, Number.NaN)).toBe(EMPTY_CART);
  });

