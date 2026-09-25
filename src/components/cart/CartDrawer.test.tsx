import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { FreeShippingMeter } from '@/components/cart/FreeShippingMeter';
import { QuantityStepper } from '@/components/ui/QuantityStepper';
import { CATALOG } from '@/data/catalog';
import { cartReducer, EMPTY_CART, makeCartLine, type CartState } from '@/domain/cart';
import { loadCart, saveCart } from '@/domain/cartStorage';
import { DEFAULT_TOAST_DURATION, MAX_TOASTS, ToastProvider, useToast } from '@/state/ToastProvider';
import { renderRoute } from '@/test/renderRoute';

const bySlug = (slug: string) => CATALOG.find((product) => product.slug === slug)!;

function seedBag(...items: [slug: string, variantIndex: number, quantity: number][]) {
  let state: CartState = EMPTY_CART;
  for (const [slug, index, quantity] of items) {
    const product = bySlug(slug);
    state = cartReducer(state, { type: 'add', line: makeCartLine(product, product.variants[index]!), quantity });
  }
  saveCart(state);
}

async function openBag() {
  await userEvent.click(screen.getByRole('button', { name: /^Bag/ }));
  return screen.getByRole('dialog', { name: /your bag/i });
}

describe('CartDrawer', () => {
  it('opens from the header as a modal and shows the lines', async () => {
    seedBag(['stoneware-mug-set', 0, 2], ['oak-serving-board', 1, 1]);
    renderRoute('/');
    const bag = await openBag();

    expect(bag).toHaveAttribute('aria-modal', 'true');
    expect(within(bag).getByRole('heading', { name: 'Your bag (3)' })).toBeInTheDocument();
    const lines = within(bag).getAllByRole('listitem');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toHaveTextContent('Stoneware mug set');
    expect(lines[0]).toHaveTextContent('Speckled');
    expect(lines[0]).toHaveTextContent('$76.80');
    expect(lines[0]).toHaveTextContent('$38.40 each');
    expect(lines[1]).toHaveTextContent('Large');
  });

  it('shows the subtotal, sale savings and free shipping', async () => {
    seedBag(['stoneware-mug-set', 0, 2], ['oak-serving-board', 1, 1]);
    renderRoute('/');
    const bag = await openBag();
    expect(within(bag).getByText('Subtotal').parentElement).toHaveTextContent('$144.80');
    expect(within(bag).getByText("You're saving").parentElement).toHaveTextContent('$19.20');
    expect(within(bag).getByText('Your order ships free.')).toBeInTheDocument();
  });

  it('moves focus in, makes the page inert, and restores both on Escape', async () => {
    seedBag(['cedar-and-vetiver-soap', 0, 1]);
    const { container } = renderRoute('/');
    const bagButton = screen.getByRole('button', { name: /^Bag/ });
    const bag = await openBag();

    expect(bag.contains(document.activeElement)).toBe(true);
    expect(container.querySelector('[data-app-shell]')).toHaveAttribute('inert');
    expect(document.body.style.overflow).toBe('hidden');

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(container.querySelector('[data-app-shell]')).not.toHaveAttribute('inert');
    expect(document.body.style.overflow).toBe('');
    expect(bagButton).toHaveFocus();
  });

  it('keeps Tab inside the drawer', async () => {
    seedBag(['cedar-and-vetiver-soap', 0, 1]);
    renderRoute('/');
    const bag = await openBag();
    for (let i = 0; i < 12; i++) {
      await userEvent.tab();
      expect(bag.contains(document.activeElement)).toBe(true);
    }
    await userEvent.tab({ shift: true });
    expect(bag.contains(document.activeElement)).toBe(true);
  });

  it('closes from the close button, the backdrop and "Keep shopping"', async () => {
    seedBag(['cedar-and-vetiver-soap', 0, 1]);
    renderRoute('/');

    await userEvent.click(within(await openBag()).getByRole('button', { name: 'Close bag' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    const bag = await openBag();
    await userEvent.click(bag.parentElement!);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await userEvent.click(within(await openBag()).getByRole('button', { name: 'Keep shopping' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('changes quantities within the stock limit', async () => {
    seedBag(['hand-thrown-bud-vase', 0, 2]); // Chalk: 3 in stock
    renderRoute('/');
    const bag = await openBag();
    const stepper = within(bag).getByRole('group', { name: 'Quantity of Hand-thrown bud vase, Chalk' });

    await userEvent.click(within(stepper).getByRole('button', { name: 'Increase' }));
    expect(stepper).toHaveTextContent('3');
    expect(within(stepper).getByRole('button', { name: 'Increase' })).toHaveAttribute('aria-disabled', 'true');
    expect(within(bag).getByText("That's all we have in stock.")).toBeInTheDocument();

    await userEvent.click(within(stepper).getByRole('button', { name: 'Increase' }));
    expect(stepper).toHaveTextContent('3');
    expect(loadCart().lines[0]!.quantity).toBe(3);

    await userEvent.click(within(stepper).getByRole('button', { name: 'Decrease' }));
    expect(loadCart().lines[0]!.quantity).toBe(2);
  });

  it('removes a line and puts it back with Undo', async () => {
    seedBag(['cedar-and-vetiver-soap', 0, 4], ['rose-clay-mask', 0, 1]);
    renderRoute('/');
    const bag = await openBag();

    await userEvent.click(within(bag).getByRole('button', { name: 'Remove Cedar and vetiver soap' }));
    expect(within(bag).getAllByRole('listitem')).toHaveLength(1);
    expect(bag).toHaveFocus();

    const toast = screen.getByRole('region', { name: 'Notifications' });
    expect(toast).toHaveTextContent('Removed from your bag');
    // The page behind is inert, but the toast lives outside it and stays usable.
    await userEvent.click(within(toast).getByRole('button', { name: 'Undo' }));
    expect(within(bag).getAllByRole('listitem')).toHaveLength(2);
    expect(loadCart().lines.find((line) => line.slug === 'cedar-and-vetiver-soap')?.quantity).toBe(4);
  });

  it('shows an inviting empty state', async () => {
    renderRoute('/');
    const bag = await openBag();
    expect(within(bag).getByText('Your bag is empty')).toBeInTheDocument();
    await userEvent.click(within(bag).getByRole('link', { name: 'Shop new arrivals' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'New in' })).toBeInTheDocument();
  });

  it('closes when following a product link, landing on the chosen variant', async () => {
    seedBag(['relaxed-linen-shirt', 13, 1]); // Ink / L (variants run Oat XS..XL, Sage XS..XL, Ink XS..XL)
    const { router } = renderRoute('/');
    const bag = await openBag();
    await userEvent.click(within(bag).getByRole('link', { name: 'Relaxed linen shirt' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/product/relaxed-linen-shirt');
    expect(router.state.location.search).toBe('?variant=ff-shirt-ink-l');
  });
});

describe('Add to bag on the product page', () => {
  async function renderProduct(path: string) {
    const view = renderRoute(path);
    await screen.findByRole('heading', { level: 1 });
    return view;
  }

  it('adds the chosen quantity, confirms with a toast and opens the bag from it', async () => {
    await renderProduct('/product/oak-serving-board?variant=gw-board-larg');
    const stepper = screen.getByRole('group', { name: 'Quantity of Oak serving board, Large' });
    await userEvent.click(within(stepper).getByRole('button', { name: 'Increase' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add to bag' }));

    expect(screen.getByRole('button', { name: 'Bag, 2 items' })).toBeInTheDocument();
    const toasts = screen.getByRole('region', { name: 'Notifications' });
    expect(toasts).toHaveTextContent('Added to your bag');
    expect(toasts).toHaveTextContent('2 × Oak serving board, Large');
    expect(screen.getByText('2 already in your bag.')).toBeInTheDocument();
    expect(stepper).toHaveTextContent('1');

    await userEvent.click(within(toasts).getByRole('button', { name: 'View bag' }));
    expect(screen.getByRole('dialog', { name: /your bag/i })).toBeInTheDocument();
  });

  it('limits the quantity to what is left and explains when the bag holds it all', async () => {
    await renderProduct('/product/hand-thrown-bud-vase'); // Chalk: 3 in stock
    const stepper = screen.getByRole('group', { name: /quantity of hand-thrown bud vase/i });
    const increase = within(stepper).getByRole('button', { name: 'Increase' });
    await userEvent.click(increase);
    await userEvent.click(increase);
    await userEvent.click(increase);
    expect(stepper).toHaveTextContent('3');

    await userEvent.click(screen.getByRole('button', { name: 'Add to bag' }));
    expect(screen.getByText('You have all 3 we can offer in your bag.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Add to bag' }));
    expect(screen.getByRole('region', { name: 'Notifications' })).toHaveTextContent('No more available');
    expect(screen.getByRole('button', { name: 'Bag, 3 items' })).toBeInTheDocument();
  });

  it('offers no add button for a sold-out variant', async () => {
    await renderProduct('/product/wool-boucle-cushion');
    expect(screen.queryByRole('button', { name: 'Add to bag' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sold out' })).toBeDisabled();
  });
});

describe('QuantityStepper', () => {
  function Harness({ max }: { max: number }) {
    const [value, setValue] = useState(1);
    return <QuantityStepper value={value} onChange={setValue} max={max} label="Quantity" />;
  }

  it('stays within its limits and keeps focus at a limit', async () => {
    render(<Harness max={2} />);
    const decrease = screen.getByRole('button', { name: 'Decrease' });
    const increase = screen.getByRole('button', { name: 'Increase' });
    expect(decrease).toHaveAttribute('aria-disabled', 'true');

    await userEvent.click(increase);
    await userEvent.click(increase);
    expect(screen.getByRole('group', { name: 'Quantity' })).toHaveTextContent('2');
    expect(increase).toHaveAttribute('aria-disabled', 'true');
    expect(increase).toHaveFocus();
  });
});

describe('FreeShippingMeter', () => {
  it('says how much more is needed and shows progress', () => {
    render(<FreeShippingMeter subtotal={5000} />);
    expect(screen.getByText('$25.00')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Progress to free shipping' })).toHaveAttribute('aria-valuenow', '67');
  });

  it('celebrates reaching the threshold', () => {
    render(<FreeShippingMeter subtotal={9000} />);
    expect(screen.getByText('Your order ships free.')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  });
});

describe('toasts', () => {
  function Trigger({ title = 'Saved', withAction = false }: { title?: string; withAction?: boolean }) {
    const { toast } = useToast();
    const [clicked, setClicked] = useState(false);
    return (
      <>
        <button
          onClick={() =>
            toast({ title, ...(withAction && { action: { label: 'Do it', onClick: () => setClicked(true) } }) })
          }
        >
          Show {title}
        </button>
        {clicked && <p>Action ran</p>}
      </>
    );
  }

  const region = () => screen.getByRole('region', { name: 'Notifications' });

  it('hides itself after a while', () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    act(() => screen.getByRole('button', { name: 'Show Saved' }).click());
    expect(region()).toHaveTextContent('Saved');
    act(() => vi.advanceTimersByTime(DEFAULT_TOAST_DURATION));
    expect(region()).not.toHaveTextContent('Saved');
  });

  it('waits while hovered', () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    act(() => screen.getByRole('button', { name: 'Show Saved' }).click());
    const toast = within(region()).getByRole('listitem');
    act(() => {
      toast.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    });
    act(() => vi.advanceTimersByTime(DEFAULT_TOAST_DURATION * 2));
    expect(region()).toHaveTextContent('Saved');
  });

  it('runs its action, then dismisses itself', async () => {
    render(
      <ToastProvider>
        <Trigger withAction />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Show Saved' }));
    await userEvent.click(within(region()).getByRole('button', { name: 'Do it' }));
    expect(screen.getByText('Action ran')).toBeInTheDocument();
    expect(within(region()).queryByRole('listitem')).not.toBeInTheDocument();
  });

  it(`can be dismissed and keeps only the newest ${MAX_TOASTS}`, async () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    const show = screen.getByRole('button', { name: 'Show Saved' });
    for (let i = 0; i < MAX_TOASTS + 2; i++) await userEvent.click(show);
    expect(within(region()).getAllByRole('listitem')).toHaveLength(MAX_TOASTS);

    await userEvent.click(within(region()).getAllByRole('button', { name: 'Dismiss notification' })[0]!);
    expect(within(region()).getAllByRole('listitem')).toHaveLength(MAX_TOASTS - 1);
  });
});
