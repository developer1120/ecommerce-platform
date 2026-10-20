/**
 * Turns a missing page's address into a search worth offering:
 * "/products/linen-throw" → "linen throw". Returns null when the address
 * has nothing word-like to go on, such as "/x" or "/123".
 */
export function searchFromPath(pathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    decoded = pathname;
  }
  const last = decoded.split('/').filter(Boolean).pop() ?? '';
  const words = last
    .replace(/\.[a-z0-9]{2,4}$/i, '')
    .replace(/[-_+.]+/g, ' ')
    .replace(/[^\p{L}\p{N} ]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return words.length >= 3 && /\p{L}{2}/u.test(words) ? words : null;
}
