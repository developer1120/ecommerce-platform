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
    await userEvent.type(input, 'ada@example.com');
    expect(input).toHaveValue('ada@example.com');
  });

  it('describes the input with its hint and marks required fields', () => {
    render(<TextField label="Postcode" hint="We only ship within the US" required />);
    const input = screen.getByRole('textbox', { name: /postcode/i });
    expect(input).toBeRequired();
    expect(input).toHaveAccessibleDescription('We only ship within the US');
  });

  it('flags an error and reads it after the hint', () => {
    render(<TextField label="Card name" hint="As printed on the card" error="Enter the name on the card" />);
    const input = screen.getByRole('textbox', { name: 'Card name' });
    expect(input).toBeInvalid();
    expect(input).toHaveAccessibleDescription('As printed on the card Enter the name on the card');
  });

  it('keeps a caller-supplied description', () => {
    render(
      <>
        <p id="extra">Shown on your receipt</p>
        <TextField label="Company" aria-describedby="extra" />
      </>,
    );
    expect(screen.getByRole('textbox', { name: 'Company' })).toHaveAccessibleDescription('Shown on your receipt');
  });

  it('can hide the label visually while keeping the accessible name', () => {
    render(<TextField label="Search the shop" hideLabel />);
    expect(screen.getByText('Search the shop')).toHaveClass('visually-hidden');
    expect(screen.getByRole('textbox', { name: 'Search the shop' })).toBeInTheDocument();
  });
});

describe('ToggleChip', () => {
  function Harness() {
    const [selected, setSelected] = useState(false);
    return (
      <ToggleChip selected={selected} onToggle={() => setSelected((value) => !value)} swatch="#c8f169">
        Lime
      </ToggleChip>
    );
  }

  it('exposes its state through aria-pressed', async () => {
    render(<Harness />);
    const chip = screen.getByRole('button', { name: 'Lime' });
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('ToggleChip labels', () => {
  it('can carry a fuller accessible name than its visible text', () => {
    render(
      <ToggleChip selected={false} onToggle={() => {}} accessibleLabel="Lilac, 2 products">
        Lilac
      </ToggleChip>,
    );
    expect(screen.getByRole('button', { name: 'Lilac, 2 products' })).toHaveTextContent('Lilac');
  });
});

describe('RemovableChip', () => {
  it('names its remove button after the chip', async () => {
    const onRemove = vi.fn();
    render(<RemovableChip onRemove={onRemove}>Under $50</RemovableChip>);
    await userEvent.click(screen.getByRole('button', { name: 'Remove Under $50' }));
    expect(onRemove).toHaveBeenCalledOnce();
  });
});

describe('Spinner', () => {
  it('is silent without a label', () => {
    const { container } = render(<Spinner />);
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('announces its label as a status', () => {
    render(<Spinner label="Loading products" />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading products');
  });
});

describe('cx', () => {
  it('joins truthy class names', () => {
    expect(cx('a', false, null, undefined, '', 'b')).toBe('a b');
  });
});

describe('HeadingIcon', () => {
  it('decorates a heading without changing its name', () => {
    render(
      <h2>
        <HeadingIcon icon={Package} />
        Your orders
      </h2>,
    );
    const heading = screen.getByRole('heading', { name: 'Your orders' });
    const icon = heading.querySelector('svg')!;
    expect(icon.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('becomes a badge for page titles', () => {
    const { container } = render(<HeadingIcon icon={Package} badge />);
    expect(container.firstElementChild!.className).toMatch(/badge/);
  });
});

describe('Badge icons', () => {
  it('shows an icon that screen readers skip', () => {
    render(<Badge icon={<Icon />}>New</Badge>);
    const badge = screen.getByText('New');
    expect(badge).toHaveTextContent(/^New$/);
    expect(screen.getByTestId('icon').closest('[aria-hidden="true"]')).toBeInTheDocument();
  });
});
