import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { THEME_STORAGE_KEY, ThemeProvider, useTheme, type ThemePreference } from './ThemeProvider';
import { setSystemDarkMode } from '@/test/matchMedia';

function Probe() {
  const { preference, resolved, setPreference } = useTheme();
  return (
    <div>
      <p>
        {preference}/{resolved}
      </p>
      {(['system', 'light', 'dark'] as ThemePreference[]).map((option) => (
        <button key={option} onClick={() => setPreference(option)}>
          {option}
        </button>
      ))}
    </div>
  );
}

function renderProbe() {
  return render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );
}

afterEach(() => {
  delete document.documentElement.dataset.theme;
});

describe('ThemeProvider', () => {
  it('follows the system theme by default and leaves data-theme unset', () => {
    renderProbe();
    expect(screen.getByText('system/light')).toBeInTheDocument();
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it('pins a chosen theme on the root element and remembers it', async () => {
    renderProbe();
    await userEvent.click(screen.getByRole('button', { name: 'dark' }));

    expect(screen.getByText('dark/dark')).toBeInTheDocument();
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('forgets the stored choice when switching back to system', async () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    renderProbe();
    expect(screen.getByText('light/light')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'system' }));
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it('ignores a stored value it does not recognise', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'sepia');
    renderProbe();
    expect(screen.getByText('system/light')).toBeInTheDocument();
  });

  it('tracks OS changes while following the system', () => {
    renderProbe();
    act(() => setSystemDarkMode(true));
    expect(screen.getByText('system/dark')).toBeInTheDocument();
  });

  it('throws a helpful error outside the provider', () => {
    // Keep the expected error out of the test output: React logs it, and jsdom reports it as uncaught.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const swallow = (event: ErrorEvent) => event.preventDefault();
    window.addEventListener('error', swallow);

    expect(() => render(<Probe />)).toThrow(/inside <ThemeProvider>/);

    window.removeEventListener('error', swallow);
    spy.mockRestore();
  });
});
