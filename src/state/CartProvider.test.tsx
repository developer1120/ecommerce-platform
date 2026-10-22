import { act, render, renderHook, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { CATALOG } from '@/data/catalog';
import { cartReducer, EMPTY_CART, makeCartLine } from '@/domain/cart';
import { CART_STORAGE_KEY, CART_STORAGE_VERSION, loadCart, saveCart } from '@/domain/cartStorage';
import { renderRoute } from '@/test/renderRoute';
import { CartProvider, useCart } from './CartProvider';

const bySlug = (slug: string) => CATALOG.find((product) => product.slug === slug)!;
const soap = bySlug('cedar-and-vetiver-soap');
const vase = bySlug('hand-thrown-bud-vase');

const wrapper = ({ children }: { children: ReactNode }) => <CartProvider>{children}</CartProvider>;

describe('CartProvider', () => {
  it('starts with the bag saved in localStorage', () => {
    saveCart(cartReducer(EMPTY_CART, { type: 'add', line: makeCartLine(soap, soap.variants[0]!), quantity: 2 }));
    const { result } = renderHook(() => useCart(), { wrapper });
    expect(result.current.itemCount).toBe(2);
    expect(result.current.subtotal).toBe(2400);
  });

  it('adds products, reports what was added and saves the bag', () => {
    const { result } = renderHook(() => useCart(), { wrapper });

    let outcome!: ReturnType<typeof result.current.add>;
    act(() => {
      outcome = result.current.add(soap, soap.variants[0]!, 3);
    });
    expect(outcome).toEqual({ quantity: 3, added: 3 });
    expect(result.current.lines).toHaveLength(1);
    expect(loadCart().lines[0]!.quantity).toBe(3);
  });

  it('reports a partial add when stock runs out', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    const chalk = vase.variants[0]!; // 3 in stock

    let first!: ReturnType<typeof result.current.add>;
    let second!: ReturnType<typeof result.current.add>;
    act(() => {
      first = result.current.add(vase, chalk, 2);
      // A second add in the same tick still sees the first one.
      second = result.current.add(vase, chalk, 2);
    });
    expect(first).toEqual({ quantity: 2, added: 2 });
    expect(second).toEqual({ quantity: 3, added: 1 });
    expect(result.current.itemCount).toBe(3);
  });

  it('changes quantities, removes lines and clears', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => {
      result.current.add(soap, soap.variants[0]!);
      result.current.add(vase, vase.variants[1]!);
    });
    act(() => result.current.setQuantity(soap.variants[0]!.id, 4));
    expect(result.current.itemCount).toBe(5);

    act(() => result.current.remove(vase.variants[1]!.id));
    expect(result.current.lines.map((line) => line.name)).toEqual(['Cedar and vetiver soap']);

    act(() => result.current.clear());
    expect(result.current.itemCount).toBe(0);
    expect(localStorage.getItem(CART_STORAGE_KEY)).toBeNull();
  });

  it('follows changes made in another tab', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    const otherTab = JSON.stringify({
      version: CART_STORAGE_VERSION,
      lines: [{ ...makeCartLine(soap, soap.variants[0]!), quantity: 5 }],
    });

    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: CART_STORAGE_KEY, newValue: otherTab }));
    });
    expect(result.current.itemCount).toBe(5);

    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'tanelt:theme', newValue: 'dark' }));
    });
    expect(result.current.itemCount).toBe(5);

    // Clearing all storage in another tab empties the bag here too.
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: null }));
    });
    expect(result.current.itemCount).toBe(0);
  });

  it('throws a helpful error outside the provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const swallow = (event: ErrorEvent) => event.preventDefault();
    window.addEventListener('error', swallow);

    function Orphan() {
      useCart();
      return null;
    }
    expect(() => render(<Orphan />)).toThrow(/inside <CartProvider>/);

    window.removeEventListener('error', swallow);
    spy.mockRestore();
  });
});

describe('header bag count', () => {
  it('shows how many items are in the bag', () => {
    saveCart(cartReducer(EMPTY_CART, { type: 'add', line: makeCartLine(soap, soap.variants[0]!), quantity: 3 }));
    renderRoute('/');
    expect(screen.getByRole('button', { name: 'Bag, 3 items' })).toHaveTextContent('3');
  });

  it('shows no count for an empty bag', () => {
    renderRoute('/');
    expect(screen.getByRole('button', { name: 'Bag' })).toBeInTheDocument();
  });
});
