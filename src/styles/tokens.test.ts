import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { contrastRatio } from './contrast';

// Read from disk: Vitest blanks stylesheets it does not process, even with ?raw.
const tokensCss = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8');

/** Reads every `--name: light-dark(#light, #dark)` token from the stylesheet. */
function readThemedColors(css: string): Record<string, { light: string; dark: string }> {
  const colors: Record<string, { light: string; dark: string }> = {};
  const pattern = /--([\w-]+):\s*light-dark\(\s*(#[0-9a-f]{6})\s*,\s*(#[0-9a-f]{6})\s*\)/gi;
  for (const [, name, light, dark] of css.matchAll(pattern)) {
    colors[name!] = { light: light!, dark: dark! };
  }
  return colors;
}

const colors = readThemedColors(tokensCss);

/** Text tokens and the backgrounds they are allowed to sit on. */
const TEXT_PAIRS: [text: string, background: string][] = [
  ['color-ink', 'color-canvas'],
  ['color-ink', 'color-surface'],
  ['color-ink', 'color-surface-sunken'],
  ['color-ink-muted', 'color-canvas'],
  ['color-ink-muted', 'color-surface'],
  ['color-ink-subtle', 'color-surface'],
  ['color-ink-subtle', 'color-canvas'],
  ['color-on-primary', 'color-primary'],
  ['color-on-primary', 'color-primary-hover'],
  ['color-on-accent', 'color-accent'],
  ['color-on-accent', 'color-accent-hover'],
  ['color-on-sale', 'color-sale'],
  ['color-sale-text', 'color-surface'],
  ['color-success', 'color-surface'],
  ['color-warning', 'color-surface'],
  ['color-danger', 'color-surface'],
  ['color-ink', 'tint-lilac'],
  ['color-ink', 'tint-sage'],
  ['color-ink', 'tint-blush'],
  ['color-ink', 'tint-sand'],
  ['color-ink', 'color-line'],
];

describe('design tokens', () => {
  it('defines every color used in the contrast checks', () => {
    const names = new Set(TEXT_PAIRS.flat());
    for (const name of names) expect(colors, `--${name}`).toHaveProperty(name);
  });

  describe.each(['light', 'dark'] as const)('%s theme', (theme) => {
    it.each(TEXT_PAIRS)('--%s on --%s meets WCAG AA (4.5:1)', (text, background) => {
      const ratio = contrastRatio(colors[text]![theme], colors[background]![theme]);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });
  });
});

describe('contrastRatio', () => {
  it('matches the WCAG reference values', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
    expect(contrastRatio('#ffffff', '#ffffff')).toBe(1);
  });

  it('rejects colors that are not 6-digit hex', () => {
    expect(() => contrastRatio('red', '#ffffff')).toThrow(/6-digit hex/);
  });
});
