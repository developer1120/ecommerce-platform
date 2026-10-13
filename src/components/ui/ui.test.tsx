import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Package } from 'lucide-react';
import { Badge, Button, HeadingIcon, IconButton, RemovableChip, Spinner, TextField, ToggleChip } from '.';
import { cx } from '@/lib/cx';

const Icon = () => <svg data-testid="icon" />;

describe('Button', () => {
  it('defaults to a primary, medium, non-submitting button', () => {
    render(<Button>Add to bag</Button>);
    const button = screen.getByRole('button', { name: 'Add to bag' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveAttribute('data-variant', 'primary');
    expect(button).toHaveAttribute('data-size', 'md');
  });

  it('passes variant, size and block through as data attributes', () => {
    render(
      <Button variant="accent" size="lg" block>
        Checkout
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Checkout' });
    expect(button).toHaveAttribute('data-variant', 'accent');
    expect(button).toHaveAttribute('data-size', 'lg');
    expect(button).toHaveAttribute('data-block', 'true');
  });

  it('calls onClick when pressed', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('ignores clicks while loading but stays focusable and announces busy', async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Placing order
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Placing order' });
    await userEvent.click(button);

    expect(onClick).not.toHaveBeenCalled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).not.toBeDisabled();
    button.focus();
    expect(button).toHaveFocus();
  });

  it('swaps the leading icon for a spinner while loading', () => {
    const { rerender } = render(<Button leadingIcon={<Icon />}>Pay</Button>);
    expect(screen.getByTestId('icon')).toBeInTheDocument();
    rerender(
      <Button loading leadingIcon={<Icon />} trailingIcon={<Icon />}>
        Pay
      </Button>,
    );
    expect(screen.queryByTestId('icon')).not.toBeInTheDocument();
  });

  it('can submit a form when asked to', async () => {
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Button type="submit">Subscribe</Button>
      </form>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Subscribe' }));
    expect(onSubmit).toHaveBeenCalledOnce();
  });
});

describe('IconButton', () => {
  it('uses the label as its accessible name and hides the icon', () => {
    render(<IconButton label="Search" icon={<Icon />} />);
    const button = screen.getByRole('button', { name: 'Search' });
    expect(screen.getByTestId('icon').parentElement).toHaveAttribute('aria-hidden', 'true');
    expect(button).toHaveAttribute('data-variant', 'ghost');
  });

  it('includes the count in its name and shows it on the corner', () => {
    render(<IconButton label="Bag" icon={<Icon />} count={3} />);
    expect(screen.getByRole('button', { name: 'Bag, 3 items' })).toHaveTextContent('3');
  });

  it('uses the singular for one item and hides a zero count', () => {
    const { rerender } = render(<IconButton label="Bag" icon={<Icon />} count={1} />);
    expect(screen.getByRole('button', { name: 'Bag, 1 item' })).toBeInTheDocument();
    rerender(<IconButton label="Bag" icon={<Icon />} count={0} />);
    expect(screen.getByRole('button', { name: 'Bag' })).toHaveTextContent('');
  });

  it('caps the visible count at 99+', () => {
    render(<IconButton label="Bag" icon={<Icon />} count={240} />);
    expect(screen.getByRole('button', { name: 'Bag, 240 items' })).toHaveTextContent('99+');
  });
});

describe('Badge', () => {
  it('renders its content with the requested tone', () => {
    render(<Badge tone="sale">−20%</Badge>);
    expect(screen.getByText('−20%')).toHaveAttribute('data-tone', 'sale');
  });

  it('defaults to the neutral tone', () => {
    render(<Badge>New</Badge>);
    expect(screen.getByText('New')).toHaveAttribute('data-tone', 'neutral');
  });
});

describe('TextField', () => {
  it('links the label to the input', async () => {
    render(<TextField label="Email" type="email" />);
    const input = screen.getByLabelText('Email');
