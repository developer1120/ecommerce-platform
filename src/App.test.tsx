import { render, screen } from '@testing-library/react';
import { App } from './App';

describe('App', () => {
  it('renders the storefront at the root URL', () => {
    render(<App />);
    expect(screen.getByRole('link', { name: 'Tanelt home' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: /objects for slower living/i })).toBeInTheDocument();
  });
});
