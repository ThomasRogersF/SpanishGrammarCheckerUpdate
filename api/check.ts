import type { VercelRequest, VercelResponse } from '@vercel/node';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

// --- Strict JSON schema (minimal V1)
const schema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'SpanishGrammarCheckResponse',
  type: 'object',
  required: ['version','language','normalized','corrected_text','corrections','fluency'],
  additionalProperties: false,
  properties: {
    version: { type: 'string', enum: ['1.0'] },
    language: { type: 'string', enum: ['es'] },
    normalized: { type: 'boolean' },
    corrected_text: { type: 'string' },
    corrections: {
      type: 'array',
      items: {
        type: 'object',
        required: ['start','end','original','suggestion','type','explanation_en','confidence'],
        properties: {
          start: { type: 'integer', minimum: 0 },
          end: { type: 'integer', minimum: 0 },
          original: { type: 'string' },
          suggestion: { type: 'string' },
          type: { type: 'string', enum: ['spelling','grammar','punctuation','agreement','accent','diacritic','other'] },
          explanation_en: { type: 'string' },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
        },
        additionalProperties: false,
      }
    },
    fluency: {
      type: 'object',
      required: ['alternatives'],
      properties: {
        alternatives: {
          type: 'array',
          items: {
            type: 'object',
            required: ['suggestion','register','explanation_en','confidence'],
            properties: {
              suggestion: { type: 'string' },
              register: { type: 'string', enum: ['neutral','formal','informal'] },
              explanation_en: { type: 'string' },
              confidence: { type: 'number', minimum: 0, maximum: 1 },
            },
            additionalProperties: false,
          }
        }
      },
      additionalProperties: false,
    },
    meta: { type: 'object', additionalProperties: true },
  }
} as const;

// --- normalization helpers
const toNFC = (s: string) => s.normalize('NFC');
function unifyEolLF(s: string): string { return (s ?? '').replace(/\r\n?/g, '\n'); }
function normalizeSpaces(s: string): string { return (s ?? '').replace(/\u00A0/g, ' ').replace(/\t/g, ' '); }
/**
 * Canonical normalization used for indexing on server:
 * - EOL -> LF
 * - NBSP -> space
 * - tabs -> single space
 * - NFC
 */
function normalizeCanonical(s: string): string {
  return toNFC(normalizeSpaces(unifyEolLF(s ?? '')));
}

function assertSpans(corrections: any[], textLen: number) {
  const spans = (corrections || []).map((c, i) => ({ i, start: c.start, end: c.end }))
                                   .sort((a,b) => a.start - b.start);
  for (let i = 0; i < spans.length; i++) {
    const { start, end } = spans[i];
    if (!(Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end >= start && end <= textLen)) {
      throw new Error('Invalid span bounds');
    }
    if (i > 0 && start < spans[i - 1].end) throw new Error('Overlapping spans');
  }
}

function buildPrompt(nfc: string) {
  return `
You are a Spanish grammar and spelling checker.

GOAL
- Analyze the NFC-normalized (with LF line endings) Spanish text between triple bars.
- Produce THREE layers: (1) CORRECTION, (2) EXPLANATION in ENGLISH, (3) FLUENCY.

RESPONSE FORMAT (IMPORTANT)
- Return ONLY a strict JSON object that conforms exactly to:
  version:"1.0"; language:"es"; normalized:boolean; corrected_text:string;
  corrections:[{start,end,original,suggestion,type,explanation_en,confidence}];
  fluency:{alternatives:[{suggestion,register,explanation_en,confidence}]};
  meta: optional object.
- Indices are 0-based; end is exclusive; indices MUST refer to the NFC+LF-normalized input.
- Indices MUST be measured in UTF-16 code units.
- Corrections MUST NOT overlap. corrected_text applies ALL corrections (no fluency).
- Prefer localized, atomic corrections; avoid grouping distant edits in a single correction.

GUIDELINES
- Keep the user's meaning; only fix actual errors in CORRECTION.
- Types: spelling, grammar, punctuation, agreement, accent, diacritic, other.
- Explanations: brief, rule-based, in English.
- Fluency alternatives may be empty if already natural.

INPUT (NFC+LF):
|||${nfc}|||

OUTPUT: JSON ONLY (no markdown or prose).
`.trim();
}

// tolerate ```json fences
function extractFirstJson(str: string) {
  const fenced = str.match(/```json\n([\s\S]*?)\n```/);
  if (fenced) str = fenced[1];
  const first = str.indexOf('{');
  if (first < 0) throw new Error('No JSON object found');
  let depth = 0;
  for (let i = first; i < str.length; i++) {
    const ch = str[i];
    if (ch === '{') depth++;
    if (ch === '}') depth--;
    if (depth === 0) return JSON.parse(str.slice(first, i + 1));
  }
  throw new Error('Unbalanced JSON');
}

async function fetchWithTimeout(url: string, init: RequestInit, ms: number) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...init, signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}

// --- Reindexing and splitting helpers
function levenshtein(a: string, b: string): number {
  const n = a.length, m = b.length;
  if (n === 0) return m;
  if (m === 0) return n;
  const dp = new Array(m + 1);
  for (let j = 0; j <= m; j++) dp[j] = j;
  for (let i = 1; i <= n; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= m; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(
        dp[j] + 1,
        dp[j - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      prev = tmp;
    }
  }
  return dp[m];
}
function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  const d = levenshtein(a, b);
  return 1 - d / maxLen;
}

type Corr = {
  start: number; end: number; original: string; suggestion: string;
  type: string; explanation_en: string; confidence: number;
};

type ReindexOptions = {
  window: number;           // ±window for local exact search
  approxWindow: number;     // ±window for approximate alignment
  levCutoff: number;        // max edit distance
  simThreshold: number;     // min similarity
  oversizedChars: number;   // >N chars triggers split
  oversizedWords: number;   // >N words triggers split
};

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function findUniqueInWindow(text: string, needle: string, hintStart: number, w: number): number | null {
  const len = text.length;
  const a = clamp(hintStart - w, 0, len);
  const b = clamp(hintStart + w, 0, len);
  const slice = text.slice(a, b);
  let idx = -1;
  let count = 0;
  let pos = 0;
  while (true) {
    const found = slice.indexOf(needle, pos);
    if (found === -1) break;
    count++;
    idx = a + found;
    pos = found + 1;
    if (count > 1) return null; // ambiguous
  }
  if (count === 1) return idx;
  return null;
}

function forwardGreedy(text: string, needle: string, cursor: number): number {
  return text.indexOf(needle, clamp(cursor, 0, text.length));
}

function approxLocalAlign(text: string, needle: string, hintStart: number, w: number, levCutoff: number, simThreshold: number): number {
  const len = text.length;
  const a = clamp(hintStart - w, 0, len);
  const b = clamp(hintStart + w, 0, len);
  let bestIdx = -1;
  let bestScore = -Infinity;
  for (let i = a; i <= Math.max(a, Math.min(b, len - needle.length)); i++) {
    const cand = text.slice(i, i + needle.length);
    const dist = levenshtein(needle, cand);
    const sim = 1 - dist / Math.max(needle.length, cand.length || 1);
    if (dist <= levCutoff || sim >= simThreshold) {
      if (sim > bestScore) {
        bestScore = sim;
        bestIdx = i;
      }
    }
  }
  return bestIdx;
}

// Tokenize into letter runs, digit runs, whitespace runs, or single other chars, preserving unicode letters
function tokenizeWithOffsets(s: string): { token: string; start: number; end: number }[] {
  const tokens: { token: string; start: number; end: number }[] = [];
  const re = /(\p{L}+|\d+|\s+|[^\s])/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    tokens.push({ token: m[1], start: m.index, end: m.index + m[1].length });
  }
  return tokens;
}

// LCS over token sequences (by string equality). Returns array of pairs (iA, iB) for equal tokens.
function lcsTokenMatches(a: string[], b: string[]): [number, number][] {
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

function splitOversized(c: Corr, opts: ReindexOptions): Corr[] {
  const orig = c.original;
  const len = orig.length;
  const words = (orig.trim().split(/\s+/).filter(Boolean)).length;
  if (len <= opts.oversizedChars && words <= opts.oversizedWords) return [c];

  const tokA = tokenizeWithOffsets(c.original);
  const tokB = tokenizeWithOffsets(c.suggestion);
  const seqA = tokA.map(t => t.token);
  const seqB = tokB.map(t => t.token);
  const matches = lcsTokenMatches(seqA, seqB);

  const result: Corr[] = [];
  let aPos = 0;
  let bPos = 0;
  function pushChange(aStartIdx: number, aEndIdx: number, bStartIdx: number, bEndIdx: number) {
    if (aStartIdx >= aEndIdx && bStartIdx >= bEndIdx) return;
    const aStartOff = aStartIdx < tokA.length ? tokA[aStartIdx].start : (tokA[tokA.length - 1]?.end ?? 0);
    const aEndOff = aEndIdx > 0 ? tokA[aEndIdx - 1].end : aStartOff;
    const origSlice = c.original.slice(aStartOff, aEndOff);
    const suggSlice = tokB.slice(bStartIdx, bEndIdx).map(t => t.token).join('');
    if (origSlice.length === 0 && suggSlice.length === 0) return;
    result.push({
      ...c,
      start: c.start + aStartOff,
      end: c.start + aEndOff,
      original: origSlice,
      suggestion: suggSlice
    });
  }

  for (let k = 0; k < matches.length; k++) {
    const [mi, mj] = matches[k];
    if (mi > aPos || mj > bPos) {
      pushChange(aPos, mi, bPos, mj);
    }
    aPos = mi + 1;
    bPos = mj + 1;
  }
  // tail
  pushChange(aPos, tokA.length, bPos, tokB.length);

  // If no effective split happened, keep as-is
  const totalSpan = result.reduce((sum, r) => sum + (r.end - r.start), 0);
  if (result.length === 0 || totalSpan === 0) return [c];
  return result;
}

function reindexCorrections(canonical: string, inputCorrs: Corr[], opts: ReindexOptions) {
  const rows: any[] = [];
  const out: Corr[] = [];
  let reindexed = 0;
  let skipped = 0;
  let totalDelta = 0;
  let oversizedSplits = 0;

  const byHint = (inputCorrs || []).map((c, i) => ({ ...c, _i: i })).sort((a, b) => a.start - b.start);
  let cursor = 0; // moving cursor for forwardGreedy

  for (const c of byHint) {
    const len = canonical.length;
    const start0 = clamp(c.start, 0, len);
    const end0 = clamp(c.end, start0, len);
    const want = c.original;
    const hintSub = canonical.slice(start0, end0);

    let newStart = start0;
    let newEnd = start0 + want.length;
    let method = 'as-is';

    // Basic as-is check
    if (canonical.slice(newStart, newEnd) !== want) {
      // Windowed unique search
      const idx1 = findUniqueInWindow(canonical, want, start0, opts.window);
      if (idx1 != null) {
        newStart = idx1;
        newEnd = idx1 + want.length;
        method = 'window';
      } else {
        // Forward greedy from cursor
        const idx2 = forwardGreedy(canonical, want, cursor);
        if (idx2 >= 0) {
          newStart = idx2;
          newEnd = idx2 + want.length;
          method = 'forward';
        } else {
          // Approximate local alignment
          const idx3 = approxLocalAlign(canonical, want, start0, opts.approxWindow, opts.levCutoff, opts.simThreshold);
          if (idx3 >= 0) {
            newStart = idx3;
            newEnd = idx3 + want.length;
            method = 'approx';
          } else {
            // ambiguous/failed
            skipped++;
            rows.push({ i: c._i, start: c.start, end: c.end, original: c.original, substring: hintSub, status: 'skipped' });
            continue;
          }
        }
      }
    }

    // Non-overlap with previous accepted span: move forward if needed
    if (newStart < cursor) {
      const idx2 = forwardGreedy(canonical, want, cursor);
      if (idx2 >= 0) {
        newStart = idx2;
        newEnd = idx2 + want.length;
        method = method + '+adj';
      } else {
        skipped++;
        rows.push({ i: c._i, start: c.start, end: c.end, original: c.original, substring: hintSub, status: 'skipped_overlap' });
        continue;
      }
    }

    if (canonical.slice(newStart, newEnd) !== want) {
      // Final sanity (could happen with approximate)
      skipped++;
      rows.push({ i: c._i, start: c.start, end: c.end, original: c.original, substring: hintSub, status: 'mismatch_after_reindex' });
      continue;
    }

    if (newStart !== start0) {
      reindexed++;
      totalDelta += Math.abs(newStart - start0);
    }

    // Build correction object with reindexed span
    const corr: Corr = { ...c, start: newStart, end: newEnd, original: want };

    // Split if oversized
    const pieces = splitOversized(corr, opts);
    if (pieces.length > 1) oversizedSplits += (pieces.length - 1);

    for (const p of pieces) {
      out.push(p);
      rows.push({
        i: c._i, start: p.start, end: p.end, original: p.original,
        substring: canonical.slice(p.start, p.end), status: method + (pieces.length > 1 ? '+split' : '')
      });
      cursor = p.end; // advance cursor
    }
  }

  // Final sort + non-overlap enforcement
  out.sort((a, b) => a.start - b.start);
  const cleaned: Corr[] = [];
  let lastEnd = 0;
  for (const c of out) {
    if (c.start < lastEnd) continue; // drop overlaps conservatively
    if (c.end <= c.start) continue;
    lastEnd = c.end;
    cleaned.push(c);
  }

  const metrics = {
    total: inputCorrs?.length || 0,
    reindexed_count: reindexed,
    skipped_count: skipped,
    oversized_splits_count: oversizedSplits,
    avg_reindex_distance: reindexed ? +(totalDelta / reindexed).toFixed(2) : 0
  };

  return { corrections: cleaned, metrics, rows };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const KEY = process.env.GEMINI_API_KEY;
    const MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
    if (!KEY) return res.status(500).json({ error: 'Missing GEMINI_API_KEY on server' });

    // Body parsing: support JSON object {text} or a raw string
    let input: string = '';
    if (typeof req.body === 'string') {
      input = req.body;
    } else if (req.body && typeof req.body === 'object') {
      // @ts-ignore
      input = (req.body.text ?? '').toString();
    }

    if (!input?.trim()) return res.status(400).json({ error: "Missing 'text'" });
    if (input.length > 3000) return res.status(413).json({ error: 'Input too long (max 3000 chars)' });

    const canonical = normalizeCanonical(input);
    const prompt = buildPrompt(canonical);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent?key=${KEY}`;

    const body = {
      contents: [{ role: 'user', parts: [{ text: prompt }]}],
      generationConfig: { response_mime_type: 'application/json' }
    };

    const call = () => fetchWithTimeout(url, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    }, 15000);

    let r = await call();
    if (!r.ok && [429,500,502,503,504].includes(r.status)) {
      await new Promise(s => setTimeout(s, 400));
      r = await call();
    }
    if (!r.ok) return res.status(502).json({ error: `Gemini HTTP ${r.status}`, detail: await r.text() });

    const data: any = await r.json();
    const textPart = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    let obj: any = textPart ? extractFirstJson(textPart) : data;

    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
    const validate = ajv.compile(schema);
    if (!validate(obj)) return res.status(502).json({ error: 'JSON failed schema validation', issues: validate.errors });

    // Reindex & split before final validation of spans
    const opts: ReindexOptions = {
      window: 60,
      approxWindow: 120,
      levCutoff: 3,
      simThreshold: 0.8,
      oversizedChars: 48,
      oversizedWords: 6
    };
    const { corrections, metrics, rows } = reindexCorrections(canonical, obj.corrections || [], opts);
    obj.corrections = corrections;

    assertSpans(obj.corrections || [], canonical.length);
    if (obj.normalized !== true) return res.status(502).json({ error: 'Model must set normalized=true for NFC indices' });

    (obj as any).meta = {
      ...(obj.meta || {}),
      canonical_text: canonical,
      canonical_length: canonical.length,
      normalization: 'NFC',
      eol_policy: 'LF',
      metrics
    };

    try {
      // Debug summary (printed once per request)
      // eslint-disable-next-line no-console
      console.table(rows.map((r: any) => ({
        i: r.i, start: r.start, end: r.end, original: r.original, substring: r.substring, status: r.status
      })));
      // eslint-disable-next-line no-console
      console.log('metrics:', metrics);
    } catch {}

    res.json(obj);
  } catch (e: any) {
    res.status(500).json({ error: 'Server error', detail: String(e?.message || e) });
  }
}