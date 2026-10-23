import axe from 'axe-core';

/*
 * Runs axe-core over the rendered page and returns its findings as readable
 * lines, so a failing test says what is wrong and where.
 *
 * Color contrast is checked by tokens.test.ts instead: jsdom does no layout
 * or painting, so axe can't work out real foreground and background colors.
 */
export async function axeViolations(root: Element = document.body): Promise<string[]> {
  const results = await axe.run(root, {
    resultTypes: ['violations'],
    rules: { 'color-contrast': { enabled: false } },
  });
  return results.violations.map(
    (violation) =>
      `${violation.id} (${violation.impact}): ${violation.help}\n` +
      violation.nodes.map((node) => `    ${node.target.join(' ')}\n    ${node.html.slice(0, 160)}`).join('\n'),
  );
}
