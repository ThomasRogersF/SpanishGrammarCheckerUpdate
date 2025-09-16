import React, { useMemo } from 'react';

type IssueType = 'spelling' | 'grammar' | 'punctuation' | 'agreement' | 'accent' | 'diacritic' | 'other';

export type CorrectionLite = {
  start: number;
  end: number;
  type: IssueType;
};

/**
 * Map correction type to Tailwind classes (light background + underline)
 * Uses warm, readable colors aligned to the new design.
 */
function issueTypeClass(type: IssueType): string {
  switch (type) {
    case 'spelling': return 'bg-red-100 underline decoration-red-500 hover:bg-red-200';
    case 'grammar': return 'bg-yellow-100 underline decoration-yellow-500 hover:bg-yellow-200';
    case 'punctuation': return 'bg-blue-100 underline decoration-blue-500 hover:bg-blue-200';
    case 'agreement': return 'bg-purple-100 underline decoration-purple-500 hover:bg-purple-200';
    case 'accent': return 'bg-emerald-100 underline decoration-emerald-500 hover:bg-emerald-200';
    case 'diacritic': return 'bg-pink-100 underline decoration-pink-500 hover:bg-pink-200';
    default: return 'bg-neutral-100 underline decoration-neutral-400 hover:bg-neutral-200';
  }
}

type Segment =
  | { kind: 'text'; s: number; e: number }
  | { kind: 'issue'; s: number; e: number; originalIndex: number; type: IssueType };

/**
 * Given text and non-overlapping corrections (with indices against that text),
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

  // Sort by start for deterministic rendering
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
 * Render text with highlighted spans for each correction.
 * Preserves whitespace and wraps long lines for readability.
 */
export default function HighlightedPreview({
  textNFC,
  corrections = [],
  idPrefix = 'issue-',
  className = '',
  titlesByIndex,
}: HighlightedPreviewProps) {
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
            className={`rounded-sm px-0.5 transition-colors duration-200 ${issueTypeClass(seg.type)}`}
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