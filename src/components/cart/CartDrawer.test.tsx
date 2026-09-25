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
