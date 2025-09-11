 // Text normalization utilities

export function normalizeToNFC(s: string): string {
  try { return (s ?? '').normalize('NFC'); } catch { return s ?? ''; }
}

export function differsFromNFC(s: string): boolean {
  try { return (s ?? '') !== normalizeToNFC(s ?? ''); } catch { return false; }
}

/**
 * Unify Windows/Mac line endings to LF to avoid index drift across platforms.
 */
export function unifyEOL(s: string): string {
  try { return (s ?? '').replace(/\r\n?/g, '\n'); } catch { return s ?? ''; }
}

/**
 * Replace NBSP and tabs with regular spaces to mirror server canonicalization.
 * - NBSP (U+00A0) -> ' '
 * - Tab -> ' '
 */
export function normalizeSpaces(s: string): string {
  try { return (s ?? '').replace(/\u00A0/g, ' ').replace(/\t/g, ' '); } catch { return s ?? ''; }
}

/**
 * Canonical client-side normalization pipeline to mirror the server:
 * 1) EOL -> LF
 * 2) NBSP -> space
 * 3) tabs -> space
 * 4) NFC
 */
export function normalizeForCanonical(s: string): string {
  return normalizeToNFC(normalizeSpaces(unifyEOL(s ?? '')));
}