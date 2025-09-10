import { useMemo, useState, useEffect, useRef } from 'react';
import HighlightedPreview from './components/HighlightedPreview';
import { normalizeForCanonical } from './utils/text';

type Correction = {
  start: number; end: number; original: string; suggestion: string;
  type: 'spelling'|'grammar'|'punctuation'|'agreement'|'accent'|'diacritic'|'other';
  explanation_en: string; confidence: number;
};
type FluencyAlt = { suggestion: string; register: 'neutral'|'formal'|'informal'; explanation_en: string; confidence: number; };
type CheckResponse = {
  version: '1.0'; language: 'es'; normalized: boolean; corrected_text: string;
  corrections: Correction[]; fluency: { alternatives: FluencyAlt[] };
  meta?: Record<string, unknown>;
};

async function checkGrammar(text: string, signal?: AbortSignal): Promise<CheckResponse> {
  const r = await fetch('/api/check', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
    signal
  });
  let data: any = null;
  try { data = await r.json(); } catch { /* ignore parse errors */ }
  if (!r.ok) {
    const msg = data?.error || `Request failed (HTTP ${r.status})`;
    throw new Error(msg);
  }
  return data as CheckResponse;
}

export default function App() {
  const [text, setText] = useState<string>('El niño paso a la tienda, pero no compró nada porque estaba my cansado. Aun así, el cajero fue muy amable.');
  const [loading, setLoading] = useState(false);
  const [coolingUntil, setCoolingUntil] = useState<number>(0);
  const [error, setError] = useState<string|null>(null);
  const [result, setResult] = useState<CheckResponse|null>(null);
  const [submittedText, setSubmittedText] = useState<string|null>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  const now = Date.now();
  const cooling = useMemo(() => now < coolingUntil, [now, coolingUntil]);

  // Canonical string from server (source of truth for highlighting). Fallback to client-side normalization of submittedText.
  const canonical = useMemo(() => {
    const metaCanon = (result as any)?.meta?.canonical_text as string | undefined;
    if (metaCanon) return metaCanon;
    const snap = submittedText ?? text;
    return normalizeForCanonical(snap);
  }, [result, submittedText, text]);

  // Drift indicator: live textarea (normalized) differs from canonical returned by server
  const drift = useMemo(() => !!result && normalizeForCanonical(text) !== canonical, [result, text, canonical]);

  // Only select in textarea when raw text exactly equals canonical (avoids index shift from CRLF -> LF)
  const rawMatchesCanonical = useMemo(() => text === canonical, [text, canonical]);

  const onCheck = async () => {
    if (loading || cooling || !text.trim()) return;
    setError(null); setLoading(true);
    setSubmittedText(text);
    try {
      const ctrl = new AbortController();
      const data = await checkGrammar(text, ctrl.signal);
      setResult(data);
      // Cooldown: 2 seconds to avoid accidental double submissions
      setCoolingUntil(Date.now() + 2000);
      setTimeout(() => setCoolingUntil(0), 2000);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  const onIssueClick = (i: number) => {
    const id = `issue-${i}`;
    const el = document.getElementById(id) as HTMLElement | null;
    if (el) {
      try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch {}
      const prevOutline = el.style.outline;
      el.style.outline = '2px solid rgba(255,255,255,0.6)';
      setTimeout(() => { el.style.outline = prevOutline; }, 700);
    }
    // Select same span in textarea only if raw text matches canonical exactly (avoids CRLF/LF index drift)
    const c = result?.corrections?.[i];
    if (c && rawMatchesCanonical && textAreaRef.current) {
      try {
        textAreaRef.current.focus();
        textAreaRef.current.setSelectionRange(c.start, c.end);
      } catch {}
    }
  };

  // Runtime invariant checks for indices against canonical string
  useEffect(() => {
    if (!result || !canonical) return;
    const corr = result.corrections || [];
    const len = canonical.length;
    for (let i = 0; i < corr.length; i++) {
      const c = corr[i];
      if (!(Number.isInteger(c.start) && Number.isInteger(c.end) && c.start >= 0 && c.end >= c.start && c.end <= len)) {
        // eslint-disable-next-line no-console
        console.warn('Span out of bounds', { i, c, len });
      }
      if (i > 0 && c.start < corr[i - 1].end) {
        // eslint-disable-next-line no-console
        console.warn('Overlapping spans', { prev: corr[i - 1], curr: c });
      }
      const sub = canonical.slice(c.start, c.end);
      if (sub !== c.original) {
        // eslint-disable-next-line no-console
        console.warn('Original mismatch', { i, start: c.start, end: c.end, expected: c.original, got: sub });
      }
    }
  }, [result, canonical]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-5xl p-6 space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Spanish Grammar Checker (V1)</h1>
          <span className="text-xs text-slate-400">Correction · Explanation (EN) · Fluency</span>
        </header>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <label className="text-sm text-slate-300">Paste Spanish text</label>
            <textarea
              ref={textAreaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={3000}
              className="w-full h-56 p-3 rounded-md bg-slate-900 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Escribe aquí…"
            />
            <div className="flex items-center gap-3">
              <button
                onClick={onCheck}
                disabled={loading || cooling || !text.trim()}
                className="px-3 py-2 rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-50"
              >
                {loading ? 'Checking…' : cooling ? 'Cooling…' : 'Check'}
              </button>
              <span className="text-xs text-slate-400">{text.length}/3000</span>
            </div>
            {error && <div className="text-sm text-red-400">{error}</div>}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <h2 className="font-semibold">Highlighted Preview</h2>
                {drift && (
                  <span className="text-[10px] text-amber-300 px-1.5 py-0.5 border border-amber-500/40 rounded">
                    Text changed — recheck to refresh highlights
                  </span>
                )}
              </div>
              <div className="min-h-24 p-3 rounded-md bg-slate-900 border border-slate-700">
                {result?.corrections?.length
                  ? <HighlightedPreview textNFC={canonical} corrections={result.corrections as any} />
                  : <span className="text-slate-400 text-sm">{text.trim() ? 'No issues to highlight.' : '—'}</span>
                }
              </div>
              <div className="flex flex-wrap gap-2 text-[11px] text-slate-300">
                <span className="px-1 rounded bg-red-500/30 underline decoration-red-400">spelling</span>
                <span className="px-1 rounded bg-yellow-500/30 underline decoration-yellow-400">grammar</span>
                <span className="px-1 rounded bg-blue-500/30 underline decoration-blue-400">punctuation</span>
                <span className="px-1 rounded bg-purple-500/30 underline decoration-purple-400">agreement</span>
                <span className="px-1 rounded bg-emerald-500/30 underline decoration-emerald-400">accent</span>
                <span className="px-1 rounded bg-pink-500/30 underline decoration-pink-400">diacritic</span>
                <span className="px-1 rounded bg-slate-500/30 underline decoration-slate-400">other</span>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h2 className="font-semibold">Corrected Text</h2>
            <div className="min-h-24 p-3 rounded-md bg-slate-900 border border-slate-700">
              {result?.corrected_text || <span className="text-slate-400 text-sm">—</span>}
            </div>

            <h2 className="font-semibold">Fluency Alternatives</h2>
            <div className="space-y-2">
              {result?.fluency?.alternatives?.length
                ? result.fluency.alternatives.map((a, i) => (
                    <div key={i} className="border border-slate-700 rounded-md p-2">
                      <div className="text-xs text-slate-400">{a.register} • {Math.round((a.confidence ?? 0)*100)}%</div>
                      <div>{a.suggestion}</div>
                      <div className="text-xs text-slate-400">{a.explanation_en}</div>
                    </div>
                  ))
                : <div className="text-slate-400 text-sm">No additional suggestions.</div>
              }
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="font-semibold">Issues</h2>
          <div className="grid gap-2 md:grid-cols-2">
            {result?.corrections?.length
              ? result.corrections.map((c, i) => (
                  <div key={i} onClick={() => onIssueClick(i)} className="border border-slate-700 rounded-md p-2 cursor-pointer hover:bg-slate-800">
                    <div className="text-xs text-slate-400">{c.type.toUpperCase()} • {Math.round((c.confidence ?? 0)*100)}%</div>
                    <div><strong>{c.original}</strong> → <span className="text-emerald-300">{c.suggestion}</span></div>
                    <div className="text-xs text-slate-400">{c.explanation_en}</div>
                    <div className="text-[10px] text-slate-500">[{c.start}, {c.end})</div>
                  </div>
                ))
              : <div className="text-slate-400 text-sm">No issues found.</div>
            }
          </div>
        </section>
      </div>
    </div>
  );
}
