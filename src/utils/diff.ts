/**
 * Diff utilities to compute diff-based highlights from canonical original text and corrected_text.
 * - Tokenization: Unicode-aware tokenization into letter runs, digit runs, whitespace runs, or single other chars.
 * - LCS-based token diff to produce hunks: equal, remove, insert, replace.
 * - Highlight spans come only from remove and replace hunks, mapped to original (canonical) offsets.
 * - Issues are attached best-effort to hunks by matching issue.original substrings within hunk ranges.
 */

export type IssueType = 'spelling' | 'grammar' | 'punctuation' | 'agreement' | 'accent' | 'diacritic' | 'other';

export type Issue = {
  original: string;
  suggestion: string;
  type: IssueType;
  explanation_en: string;
  confidence: number;
};

export type Token = { token: string; start: number; end: number };

export type HunkKind = 'equal' | 'remove' | 'insert' | 'replace';

export type Hunk = {
  kind: HunkKind;
  // token index ranges in original (A) and corrected (B)
  aStart: number;
  aEnd: number;
  bStart: number;
  bEnd: number;
  // char offsets in original and corrected
  aStartOffset: number;
  aEndOffset: number;
  bStartOffset: number;
  bEndOffset: number;
};

export type HighlightSpan = { start: number; end: number; type: IssueType; originalIndex: number };

export type BuildHighlightsResult = {
  spans: HighlightSpan[];
  hunkRanges: { start: number; end: number }[];
  issueToHunk: (number | null)[];
  hunkToIssues: number[][];
  diagnostics: {
    totalHunks: number;
    highlightedHunks: number;
    attachedIssues: number;
    unplacedIssues: number;
    unplacedSamples: { index: number; original: string; reason: string }[];
  };
};

function isWhitespaceRun(s: string): boolean {
  return /^\s+$/.test(s);
}

/**
 * Unicode-aware tokenization into:
 * - letter runs: \p{L}+
 * - digit runs: \d+
 * - whitespace runs: \s+
 * - single other non-whitespace chars: [^\s]
 * Returns tokens with original start/end offsets.
 */
export function tokenizeUnicodeWords(s: string): Token[] {
  const tokens: Token[] = [];
  const re = /(\p{L}+|\d+|\s+|[^\s])/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    const seg = m[1];
    tokens.push({ token: seg, start: m.index, end: m.index + seg.length });
  }
  return tokens;
}

/**
 * LCS over token string sequences (by equality). Returns array of pairs (iA, iB) for equal tokens.
 */
export function lcsTokenMatches(a: string[], b: string[]): [number, number][] {
  const n = a.length, m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? 1 + dp[i + 1][j + 1] : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const matches: [number, number][] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      matches.push([i, j]);
      i++; j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return matches;
}

/**
 * Build ordered hunks (equal/remove/insert/replace) over token sequences of original vs corrected.
 */
export function diffTokensToHunks(original: string, corrected: string): Hunk[] {
  const tokA = tokenizeUnicodeWords(original);
  thetok: {
    // prevent unused warning in some toolchains; we actually use tokA values below
  }
  const tokB = tokenizeUnicodeWords(corrected);
  const A = tokA.map(t => t.token);
  const B = tokB.map(t => t.token);
  const matches = lcsTokenMatches(A, B);

  const hunks: Hunk[] = [];
  let aPos = 0;
  let bPos = 0;

  function offsetsA(aStart: number, aEnd: number): [number, number] {
    const start = aStart < tokA.length ? tokA[aStart].start : (tokA[tokA.length - 1]?.end ?? 0);
    const end = aEnd > 0 ? tokA[aEnd - 1].end : start;
    return [start, end];
  }
  function offsetsB(bStart: number, bEnd: number): [number, number] {
    const start = bStart < tokB.length ? tokB[bStart].start : (tokB[tokB.length - 1]?.end ?? 0);
    const end = bEnd > 0 ? tokB[bEnd - 1].end : start;
    return [start, end];
  }

  const pushHunk = (kind: HunkKind, aStart: number, aEnd: number, bStart: number, bEnd: number) => {
    const [aStartOff, aEndOff] = offsetsA(aStart, aEnd);
    const [bStartOff, bEndOff] = offsetsB(bStart, bEnd);
    hunks.push({
      kind,
      aStart, aEnd, bStart, bEnd,
      aStartOffset: aStartOff,
      aEndOffset: aEndOff,
      bStartOffset: bStartOff,
      bEndOffset: bEndOff
    });
  };

  for (let k = 0; k < matches.length; k++) {
    const [mi, mj] = matches[k];
    // changes before this equal match
    const aChanged = mi > aPos;
    const bChanged = mj > bPos;
    if (aChanged || bChanged) {
      if (aChanged && bChanged) {
        // replace
        pushHunk('replace', aPos, mi, bPos, mj);
      } else if (aChanged) {
        // remove
        pushHunk('remove', aPos, mi, bPos, bPos);
      } else {
        // insert
        pushHunk('insert', aPos, aPos, bPos, mj);
      }
    }
    // equal hunk for this one matching token; we can coalesce consecutive equals later
    pushHunk('equal', mi, mi + 1, mj, mj + 1);
    aPos = mi + 1;
    bPos = mj + 1;
  }

  // tail changes after last match
  const aTail = tokA.length;
  const bTail = tokB.length;
  if (aTail > aPos || bTail > bPos) {
    const aChanged = aTail > aPos;
    const bChanged = bTail > bPos;
    if (aChanged && bChanged) {
      pushHunk('replace', aPos, aTail, bPos, bTail);
    } else if (aChanged) {
      pushHunk('remove', aPos, aTail, bPos, bPos);
    } else if (bChanged) {
      pushHunk('insert', aPos, aPos, bPos, bTail);
    }
  }

  // coalesce consecutive equal hunks
  const coalesced: Hunk[] = [];
  for (const h of hunks) {
    const last = coalesced[coalesced.length - 1];
    if (last && last.kind === 'equal' && h.kind === 'equal' && last.aEnd === h.aStart && last.bEnd === h.bStart) {
      // merge
      last.aEnd = h.aEnd;
      last.bEnd = h.bEnd;
      last.aEndOffset = h.aEndOffset;
      last.bEndOffset = h.bEndOffset;
    } else {
      coalesced.push({ ...h });
    }
  }

  return coalesced;
}

/**
 * Create highlight spans from hunks over original text: only 'remove' and 'replace' hunks.
 * Ensures non-overlapping spans left-to-right.
 */
export function hunksToOriginalSpans(hunks: Hunk[]): { ranges: { start: number; end: number }[] } {
  const ranges: { start: number; end: number }[] = [];
  let lastEnd = 0;
  for (const h of hunks) {
    if (h.kind !== 'remove' && h.kind !== 'replace') continue;
    const start = Math.max(0, h.aStartOffset);
    const end = Math.max(start, h.aEndOffset);
    if (end <= start) continue;
    if (start < lastEnd) {
      // clamp to avoid overlap
      if (end <= lastEnd) continue;
      ranges.push({ start: lastEnd, end });
      lastEnd = end;
    } else {
      ranges.push({ start, end });
      lastEnd = end;
    }
  }
  return { ranges };
}

function findOccurrencesInRange(text: string, needle: string, start: number, end: number): number[] {
  const out: number[] = [];
  if (!needle) return out;
  let pos = start;
  while (true) {
    const idx = text.indexOf(needle, pos);
    if (idx === -1 || idx + needle.length > end) break;
    out.push(idx);
    pos = idx + 1;
  }
  return out;
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return Math.max(aStart, bStart) < Math.min(aEnd, bEnd);
}

export function chooseSpanType(issues: Issue[] | undefined): IssueType {
  const t = issues?.[0]?.type;
  return (t as IssueType) || 'other';
}

/**
 * Build diff-based highlights and attach issues best-effort.
 */
export function buildDiffHighlights(original: string, corrected: string, issues: Issue[] = []): BuildHighlightsResult {
  const hunks = diffTokensToHunks(original, corrected);
  const { ranges } = hunksToOriginalSpans(hunks);

  // Prepare structures
  const issueToHunk: (number | null)[] = new Array(issues.length).fill(null);
  const hunkToIssues: number[][] = ranges.map(() => []);
  const hunkClaims: { start: number; end: number }[][] = ranges.map(() => []);
  const unplaced: { index: number; original: string; reason: string }[] = [];

  // For each issue, find candidate hunks by presence of original substring
  issues.forEach((iss, idx) => {
    const needle = iss?.original ?? '';
    if (!needle) {
      unplaced.push({ index: idx, original: needle, reason: 'empty_original' });
      return;
    }
    const candidates: { h: number; positions: number[] }[] = [];
    for (let h = 0; h < ranges.length; h++) {
      const r = ranges[h];
      const pos = findOccurrencesInRange(original, needle, r.start, r.end);
      if (pos.length > 0) candidates.push({ h, positions: pos });
    }
    if (candidates.length === 0) {
      unplaced.push({ index: idx, original: needle, reason: 'no_matching_hunk' });
      return;
    }
    if (candidates.length > 1) {
      // ambiguous across hunks
      unplaced.push({ index: idx, original: needle, reason: 'ambiguous_multiple_hunks' });
      return;
    }
    const { h, positions } = candidates[0];
    // choose first unclaimed left-to-right occurrence
    let placed = false;
    for (const p of positions) {
      const start = p;
      const end = p + needle.length;
      const claims = hunkClaims[h];
      const collides = claims.some(c => overlaps(c.start, c.end, start, end));
      if (!collides) {
        claims.push({ start, end });
        issueToHunk[idx] = h;
        hunkToIssues[h].push(idx);
        placed = true;
        break;
      }
    }
    if (!placed) {
      unplaced.push({ index: idx, original: needle, reason: 'ambiguous_claimed' });
    }
  });

  // Build typed spans
  const spans: HighlightSpan[] = ranges.map((r, hunkId) => {
    const attached = hunkToIssues[hunkId].map(i => issues[i]);
    const t = chooseSpanType(attached);
    return { start: r.start, end: r.end, type: t, originalIndex: hunkId };
  });

  const diagnostics = {
    totalHunks: hunks.length,
    highlightedHunks: ranges.length,
    attachedIssues: issueToHunk.filter(x => x != null).length,
    unplacedIssues: unplaced.length,
    unplacedSamples: unplaced.slice(0, 5),
  };

  return { spans, hunkRanges: ranges, issueToHunk, hunkToIssues, diagnostics };
}