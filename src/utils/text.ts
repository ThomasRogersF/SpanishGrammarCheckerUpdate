/**
 * Text normalization used for canonical comparisons/highlights.
 * - NFC normalization for consistent diacritics
 * - Normalize newlines to \n
 */
export function normalizeForCanonical(input: string): string {
  const s = (input ?? '').toString();
  // NFC ensures accent/diacritic graphemes are consistent
  return s.normalize('NFC').replace(/\r\n/g, '\n');
}