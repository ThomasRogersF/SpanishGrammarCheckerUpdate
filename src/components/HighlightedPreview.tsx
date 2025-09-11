import React, { useMemo } from 'react';

type IssueType = 'spelling' | 'grammar' | 'punctuation' | 'agreement' | 'accent' | 'diacritic' | 'other';
type CorrectionLite = {
  start: number;
  end: number;
  type: IssueType;
};

/**
 * Map correction type to Tailwind classes (background + underline color)
 */
function issueTypeClass(type: IssueType): string {
  switch (type) {
    case 'spelling': return 'bg-red-500/30 underline decoration-red-400';
    case 'grammar': return 'bg-yellow-500/30 underline decoration-yellow-400';
    case 'punctuation': return 'bg-blue-500/30 underline decoration-blue-400';
    case 'agreement': return 'bg-purple-500/30 underline decoration-purple-400';
    case 'accent': return 'bg-emerald-500/30 underline decoration-emerald-400';
    case 'diacritic': return 'bg-pink-500/30 underline decoration-pink-400';
    default: return 'bg-slate-500/30 underline decoration-slate-400';
  }
}

type Segment =
  | { kind: 'text'; s: number; e: number }
  | { kind: 'issue'; s: number; e: number; originalIndex: number; type: IssueType };

/**
 * Given NFC text and non-overlapping corrections (with indices against NFC),
 * produce an interleaved sequence of plain and highlighted segments.
 * - Corrections may be out-of-order in the array; we sort by start to walk.
 * - We preserve each correction's original index for ids like "issue-${i}".
 * - We defensively clamp spans into [0, text.length] and skip invalid ones.
 */
export function computeSegments(text: string, corrections: CorrectionLite[]): Segment[] {
  const len = text.length;
  const rects = (Array.isArray(corrections) ? corrections : [])
    .map((c: any, i: number) => ({
      start: Math.max(0, Math.min(len, Number(c?.start ?? 0))),
      end: Math.max(0, Math.min(len, Number(c?.end ?? 0))),
      type: (c?.type ?? 'other') as IssueType,
      originalIndex: i,
    }))
    .filter(r => Number.isFinite(r.start) && Number.isFinite(r.end) && r.end >= r.start);

  // Sort by start, stable for deterministic rendering
  rects.sort((a, b) => a.start - b.start);

  const out: Segment[] = [];
  let cursor = 0;

  for (const r of rects) {
    if (r.start > cursor) {
      out.push({ kind: 'text', s: cursor, e: r.start });
    }
    if (r.end > r.start) {
      out.push({ kind: 'issue', s: r.start, e: r.end, originalIndex: r.originalIndex, type: r.type });
      cursor = r.end;
    }
  }

  if (cursor < len) out.push({ kind: 'text', s: cursor, e: len });
  return out;
}

export type HighlightedPreviewProps = {
  textNFC: string;
  corrections?: CorrectionLite[];
  idPrefix?: string; // default: 'issue-'
  className?: string;
  // Optional titles for each correction index (by original array index before internal sort)
  titlesByIndex?: string[];
};

/**
 * Render normalized text with highlighted spans for each correction.
 * Preserves whitespace and wraps long lines for readability.
 */
export default function HighlightedPreview({ textNFC, corrections = [], idPrefix = 'issue-', className = '', titlesByIndex }: HighlightedPreviewProps) {
  const segments = useMemo(() => computeSegments(textNFC || '', corrections), [textNFC, corrections]);

  return (
    <div className={`whitespace-pre-wrap break-words leading-relaxed ${className}`}>
      {segments.map((seg, idx) => {
        const slice = textNFC.slice(seg.s, seg.e);
        if (seg.kind === 'text') {
          return <span key={idx}>{slice}</span>;
        }
        // Highlighted issue segment
        return (
          <span
            key={idx}
            id={`${idPrefix}${seg.originalIndex}`}
            className={`rounded-sm px-0.5 ${issueTypeClass(seg.type)}`}
            title={titlesByIndex?.[seg.originalIndex] || undefined}
          >
            {slice}
          </span>
        );
      })}
    </div>
  );
}

// Re-export class helper for legend usage
export { issueTypeClass };