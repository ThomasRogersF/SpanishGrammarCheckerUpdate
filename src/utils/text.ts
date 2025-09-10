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
 * Canonical client-side normalization pipeline to mirror the server:
 * 1) EOL unification to LF
 * 2) NFC normalization
 */
export function normalizeForCanonical(s: string): string {
  return normalizeToNFC(unifyEOL(s ?? ''));
}