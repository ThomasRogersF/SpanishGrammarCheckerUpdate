/**
 * Diff-based highlight utility (UI-only).
 * Produces non-overlapping spans in SOURCE (canonical) text where it differs from the corrected text.
 *
 * Strategy:
 * - Tokenize source and corrected into lightweight word/punct tokens (with source positions).
 * - Compute LCS over token strings to find equal regions.
 * - Any source token ranges not part of the LCS are considered "changed" hunks and highlighted.
 * - Optionally attach model issues to hunks by overlap to derive a display type and tooltip titles.
 */

export type IssueType = 'spelling' | 'grammar' | 'punctuation' | 'agreement' | 'accent' | 'diacritic' | 'other';

export type IssueLite = {
  start: number;
  end: number;
  type: IssueType;
  explanation_en?: string;
};

export type DiffSpan = {
  start: number; // inclusive index in source text
  end: number;   // exclusive index in source text
  type: IssueType;
};

export type DiffData = {
  spans: DiffSpan[];
  hunkRanges: { start: number; end: number }[];
  issueToHunk: Record<number, number>;
  hunkToIssues: Record<number, number[]>;
  diagnostics: {
    totalHunks: number;
    highlightedHunks: number;
    attachedIssues: number;
    unplacedIssues: number;
    unplacedSamples?: Array<{ issueIdx: number; start: number; end: number }>;
  };
};

// Tokenization: words or single non-space chars, with source indices
type SrcToken = { text: string; s: number; e: number };

// Matches words (letters/numbers) or any single non-whitespace char
const TOKEN_RE = /[\p{L}\p{N}]+|[^\s]/gu;

function tokenizeWithPositions(src: string): SrcToken[] {
  const out: SrcToken[] = [];
  for (const m of src.matchAll(TOKEN_RE)) {
    const text = m[0];
    const s = m.index ?? 0;
    out.push({ text, s, e: s + text.length });
  }
  return out;
}

function tokenizeStrings(s: string): string[] {
  return Array.from(s.matchAll(TOKEN_RE), m => m[0]);
}

// LCS on tokens (by text equality), returns pairs of matching indices
function lcsPairs(a: string[], b: string[]): Array<{ i: number; j: number }> {
  const n = a.length, m = b.length;
  // For typical lengths (<= 1500 tokens) this O(n*m) is acceptable for UI.
  const dp = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const pairs: Array<{ i: number; j: number }> = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      pairs.push({ i, j });
      i++; j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return pairs;
}

// Build diff hunks (ranges in source) from LCS pairs
function buildSourceHunks(srcTokens: SrcToken[], dstTokens: string[]): { start: number; end: number }[] {
  const a = srcTokens.map(t => t.text);
  const b = dstTokens;
  const pairs = lcsPairs(a, b);

  const hunks: { start: number; end: number }[] = [];
  let aIdx = 0;
  for (const p of pairs) {
    // Any gap in aIdx..p.i are changes in source
    if (p.i > aIdx) {
      const s = srcTokens[aIdx].s;
      const e = srcTokens[p.i - 1].e;
      if (e > s) hunks.push({ start: s, end: e });
    }
    aIdx = p.i + 1;
  }
  // Tail of source
  if (aIdx < srcTokens.length) {
    const s = srcTokens[aIdx].s;
    const e = srcTokens[srcTokens.length - 1].e;
    if (e > s) hunks.push({ start: s, end: e });
  }

  // Merge adjacent/overlapping hunks defensively
  if (hunks.length <= 1) return hunks;
  hunks.sort((x, y) => x.start - y.start);
  const merged: { start: number; end: number }[] = [];
  let cur = { ...hunks[0] };
  for (let k = 1; k < hunks.length; k++) {
    const h = hunks[k];
    if (h.start <= cur.end) {
      cur.end = Math.max(cur.end, h.end);
    } else {
      merged.push(cur);
      cur = { ...h };
    }
  }
  merged.push(cur);
  return merged;
}

// Attach issues to hunks by overlap
function attachIssuesToHunks(hunks: { start: number; end: number }[], issues: IssueLite[]) {
  const hunkToIssues: Record<number, number[]> = {};
  const issueToHunk: Record<number, number> = {};
  const unplaced: Array<{ issueIdx: number; start: number; end: number }> = [];

  for (let i = 0; i < issues.length; i++) {
    const is = issues[i];
    let placed = false;
    for (let h = 0; h < hunks.length; h++) {
      const { start, end } = hunks[h];
      if (Math.max(start, is.start) < Math.min(end, is.end)) {
        (hunkToIssues[h] ||= []).push(i);
        issueToHunk[i] = h;
        placed = true;
        break;
      }
    }
    if (!placed) unplaced.push({ issueIdx: i, start: is.start, end: is.end });
  }
  return { hunkToIssues, issueToHunk, unplaced };
}

// Choose a type for a hunk: majority of attached issues, else 'other'
function chooseHunkType(issueIdxs: number[], issues: IssueLite[]): IssueType {
  if (!issueIdxs.length) return 'other';
  const counts: Record<IssueType, number> = {
    spelling: 0, grammar: 0, punctuation: 0, agreement: 0, accent: 0, diacritic: 0, other: 0,
  };
  for (const idx of issueIdxs) {
    const t = (issues[idx]?.type ?? 'other') as IssueType;
    counts[t] = (counts[t] ?? 0) + 1;
  }
  let best: IssueType = 'other';
  let max = -1;
  (Object.keys(counts) as IssueType[]).forEach((k) => {
    if (counts[k] > max) { max = counts[k]; best = k; }
  });
  return best;
}

export function buildDiffHighlights(sourceNFC: string, corrected: string, issuesInput: Array<Partial<IssueLite> & { type?: string }> = []): DiffData {
  const source = sourceNFC ?? '';
  const dst = corrected ?? '';
  const srcTokens = tokenizeWithPositions(source);
  const dstTokens = tokenizeStrings(dst);

  const hunks = buildSourceHunks(srcTokens, dstTokens);

  // Normalize issues input
  const issues: IssueLite[] = (issuesInput || []).map((c) => ({
    start: Math.max(0, Math.min(source.length, Number((c as any)?.start ?? 0))),
    end: Math.max(0, Math.min(source.length, Number((c as any)?.end ?? 0))),
    type: ((c?.type as IssueType) ?? 'other'),
    explanation_en: (c as any)?.explanation_en || undefined,
  })).filter(x => Number.isFinite(x.start) && Number.isFinite(x.end) && x.end >= x.start);

  const { hunkToIssues, issueToHunk, unplaced } = attachIssuesToHunks(hunks, issues);

  const spans: DiffSpan[] = hunks.map((r, hId) => ({
    start: r.start,
    end: r.end,
    type: chooseHunkType(hunkToIssues[hId] || [], issues),
  }));

  // Guard: ensure in-bounds, non-overlapping, sorted
  spans.sort((a, b) => a.start - b.start);
  const filtered: DiffSpan[] = [];
  let lastEnd = 0;
  for (const s of spans) {
    if (!(Number.isInteger(s.start) && Number.isInteger(s.end) && s.start >= 0 && s.end >= s.start && s.end <= source.length)) {
      continue;
    }
    if (filtered.length && s.start < lastEnd) {
      // overlap: clamp/skip
      if (s.end <= lastEnd) continue;
      s.start = lastEnd;
    }
    filtered.push(s);
    lastEnd = s.end;
  }

  return {
    spans: filtered,
    hunkRanges: hunks,
    issueToHunk,
    hunkToIssues,
    diagnostics: {
      totalHunks: hunks.length,
      highlightedHunks: filtered.length,
      attachedIssues: Object.keys(issueToHunk).length,
      unplacedIssues: unplaced.length,
      unplacedSamples: unplaced.slice(0, 5),
    },
  };
}