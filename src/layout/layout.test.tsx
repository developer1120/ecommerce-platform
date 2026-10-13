import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ANNOUNCEMENTS } from '@/config/navigation';
import { renderRoute } from '@/test/renderRoute';
import { AnnouncementBar, ROTATE_EVERY_MS } from './AnnouncementBar';

afterEach(() => {
  delete document.documentElement.dataset.theme;
});

describe('RootLayout', () => {
  it('wraps every page in the announcement bar, header, main region and footer', () => {
    renderRoute('/');
    expect(screen.getByRole('region', { name: 'Store announcements' })).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main');
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });

  it('offers a skip link to the main content', () => {
    renderRoute('/');
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main');
  });

  it('sets the document title per page', () => {
    renderRoute('/');
    expect(document.title).toBe('Tanelt');
  });
});

describe('routing', () => {
  it('shows a department page with its name and title', () => {
    renderRoute('/shop/apparel');
    expect(screen.getByRole('heading', { level: 1, name: 'Apparel' })).toBeInTheDocument();
    expect(document.title).toBe('Apparel · Tanelt');
  });

  it('falls back to all products for /shop and unknown departments', () => {
    renderRoute('/shop');
    expect(screen.getByRole('heading', { level: 1, name: 'All products' })).toBeInTheDocument();
  });

  it('shows a not-found page for unknown URLs, inside the layout', () => {
    renderRoute('/nope/really-not-here');
    expect(screen.getByRole('heading', { level: 1, name: 'This page has wandered off' })).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(document.title).toBe('Page not found · Tanelt');
  });
});

describe('SiteHeader', () => {
  it('links each department and marks the current one', async () => {
    renderRoute('/');
    const nav = screen.getByRole('navigation', { name: 'Departments' });
    await userEvent.click(within(nav).getByRole('link', { name: 'Beauty' }));

    expect(screen.getByRole('heading', { level: 1, name: 'Beauty' })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'Beauty' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current');
  });

  it('switches between light and dark from the header', async () => {
    renderRoute('/');
    await userEvent.click(screen.getByRole('button', { name: 'Switch to dark theme' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    await userEvent.click(screen.getByRole('button', { name: 'Switch to light theme' }));
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('opens the mobile menu and closes it on navigation', async () => {
    renderRoute('/');
    const toggle = screen.getByRole('button', { name: 'Open menu' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveAccessibleName('Close menu');
    const menu = screen.getByRole('navigation', { name: 'Menu' });

    await userEvent.click(within(menu).getByRole('link', { name: 'Sale' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Sale' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open menu' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes the mobile menu with Escape', async () => {
    renderRoute('/');
    await userEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: 'Open menu' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('shows the bag button without a count while the bag is empty', () => {
    renderRoute('/');
    expect(screen.getByRole('button', { name: 'Bag' })).toBeInTheDocument();
  });
});

describe('SiteFooter', () => {
  it('rejects an empty or malformed email and accepts a valid one', async () => {
    renderRoute('/');
    const footer = screen.getByRole('contentinfo');
    const input = within(footer).getByRole('textbox', { name: 'Email address' });
    const submit = within(footer).getByRole('button', { name: 'Subscribe' });

    await userEvent.click(submit);
    expect(input).toBeInvalid();
    expect(input).toHaveAccessibleDescription('Enter your email address');

    await userEvent.type(input, 'not-an-email');
    expect(input).not.toHaveAttribute('aria-invalid');
    await userEvent.click(submit);
    expect(input).toHaveAccessibleDescription('Enter an email address like name@example.com');

    await userEvent.clear(input);
    await userEvent.type(input, 'ada@example.com');
    await userEvent.click(submit);
    expect(within(footer).getByRole('status')).toHaveTextContent("You're on the list");
    expect(within(footer).getByRole('status')).toHaveTextContent('ada@example.com');
  });

  it('lists help and shop links', () => {
    renderRoute('/');
    const help = screen.getByRole('navigation', { name: 'Help' });
    expect(within(help).getByRole('link', { name: 'Returns' })).toHaveAttribute('href', '/help/returns');
    const shop = screen.getByRole('navigation', { name: 'Shop' });
    expect(within(shop).getByRole('link', { name: 'Sale' })).toHaveAttribute('href', '/shop/sale');
  });

  it('chooses the theme from a radio group that includes system', async () => {
    renderRoute('/');
    const group = screen.getByRole('group', { name: 'Theme' });
    expect(within(group).getByRole('radio', { name: 'System' })).toBeChecked();

    await userEvent.click(within(group).getByRole('radio', { name: 'Dark' }));
    expect(document.documentElement.dataset.theme).toBe('dark');

    await userEvent.click(within(group).getByRole('radio', { name: 'System' }));
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
});

describe('AnnouncementBar', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('rotates through the messages', () => {
    render(<AnnouncementBar messages={ANNOUNCEMENTS} />);
    expect(screen.getByText(ANNOUNCEMENTS[0]!)).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(ROTATE_EVERY_MS));
    expect(screen.getByText(ANNOUNCEMENTS[1]!)).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(ROTATE_EVERY_MS * 2));
    expect(screen.getByText(ANNOUNCEMENTS[0]!)).toBeInTheDocument();
  });

  it('stops rotating when paused and resumes on play', () => {
    render(<AnnouncementBar messages={ANNOUNCEMENTS} />);
    act(() => screen.getByRole('button', { name: 'Pause announcements' }).click());
    act(() => vi.advanceTimersByTime(ROTATE_EVERY_MS * 3));
    expect(screen.getByText(ANNOUNCEMENTS[0]!)).toBeInTheDocument();

    act(() => screen.getByRole('button', { name: 'Play announcements' }).click());
    // Clicking moves focus into the bar, which also pauses; move it away.
    act(() => (document.activeElement as HTMLElement).blur());
    act(() => vi.advanceTimersByTime(ROTATE_EVERY_MS));
    expect(screen.getByText(ANNOUNCEMENTS[1]!)).toBeInTheDocument();
  });

  it('holds still while hovered', async () => {
    render(<AnnouncementBar messages={ANNOUNCEMENTS} />);
    const bar = screen.getByRole('region', { name: 'Store announcements' });
    act(() => {
      bar.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    });
    act(() => vi.advanceTimersByTime(ROTATE_EVERY_MS * 2));
    expect(screen.getByText(ANNOUNCEMENTS[0]!)).toBeInTheDocument();
  });

  it('shows a single message without rotation controls', () => {
    render(<AnnouncementBar messages={['Only one']} />);
    expect(screen.getByText('Only one')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders nothing without messages', () => {
    const { container } = render(<AnnouncementBar messages={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
