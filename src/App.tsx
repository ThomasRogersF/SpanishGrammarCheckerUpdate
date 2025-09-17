import { useMemo, useState } from 'react';
import { Wand2, Copy, Trash2, Loader2, CheckCircle, AlertTriangle, FileText} from 'lucide-react';
import HighlightedPreview from './components/HighlightedPreview';
import { normalizeForCanonical } from './utils/text';
import GrammarCheckerSection from './components/GrammarCheckerSection';
import MasterSpanishSection from './components/MasterSpanishSection';
import { buildDiffHighlights } from './utils/diff';

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
  const [copyFeedback, setCopyFeedback] = useState<string>('');

  const now = Date.now();
  const cooling = useMemo(() => now < coolingUntil, [now, coolingUntil]);

  const onCheck = async () => {
    if (loading || cooling || !text.trim()) return;
    setError(null); setLoading(true);
    try {
      const ctrl = new AbortController();
      const data = await checkGrammar(text, ctrl.signal);
      setResult(data);
      setCoolingUntil(Date.now() + 2000);
      setTimeout(() => setCoolingUntil(0), 2000);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  const onCopy = async () => {
    const textToCopy = result?.corrected_text || text;
    if (!textToCopy.trim()) return;

    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopyFeedback('Copied!');
      setTimeout(() => setCopyFeedback(''), 2000);
    } catch (e) {
      setCopyFeedback('Copy failed');
      setTimeout(() => setCopyFeedback(''), 2000);
    }
  };

  const onClear = () => {
    setText('');
    setResult(null);
    setError(null);
    setCopyFeedback('');
  };

  const wordCount = useMemo(() => (text.trim() ? text.trim().split(/\s+/).length : 0), [text]);
  const typeCounts = useMemo(() => {
    const m: Record<string, number> = {};
    (result?.corrections || []).forEach(c => { m[c.type] = (m[c.type] || 0) + 1; });
    return m;
  }, [result]);
  const totalIssues = result?.corrections?.length || 0;

  // Diff-based highlighted preview (UI-only)
  const canonical = useMemo(() => {
    const metaCanon = (result as any)?.meta?.canonical_text as string | undefined;
    if (metaCanon) return metaCanon;
    return normalizeForCanonical(text);
  }, [result, text]);

  const diffData = useMemo(() => {
    if (!result?.corrected_text) return null;
    const issues = (result.corrections || []).map((c) => ({
      start: c.start,
      end: c.end,
      type: c.type as any,
      explanation_en: c.explanation_en,
    }));
    return buildDiffHighlights(canonical, result.corrected_text, issues);
  }, [result, canonical]);

  const diffTitles = useMemo(() => {
    if (!diffData) return undefined;
    const corrs = result?.corrections || [];
    const titles: (string | undefined)[] = diffData.spans.map((_, hunkId) => {
      const issueIdxs = diffData.hunkToIssues[hunkId] || [];
      if (!issueIdxs.length) return undefined;
      const types = Array.from(new Set(issueIdxs.map(i => corrs[i]?.type).filter(Boolean))).join(', ') || 'other';
      const first = corrs[issueIdxs[0]];
      const expl = first?.explanation_en || '';
      return expl ? `${types} — ${expl}` : types;
    });
    return titles;
  }, [diffData, result]);

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-7xl px-6 py-8 space-y-8">
        <header className="flex flex-col items-center text-center gap-4 animate-fadeIn">
          <div className="flex flex-col items-center gap-4 mb-2">
            <button
              onClick={() => window.parent.postMessage({ action: 'redirect', url: 'https://spanishvip.com/' }, '*')}
              className="cursor-pointer hover:opacity-90 transition-opacity"
              aria-label="Go to SpanishVIP"
            >
              <img src="/Images/logo.png" alt="SpanishVIP Logo" className="h-16 w-64 md:h-20 md:w-80" />
            </button>
            <h1 className="text-3xl md:text-4xl font-bold">
              <span className="text-orange-600">SpanishVIP</span>{' '}
              <span className="animated-gradient-text">Grammar Checker (Free) — Fix Grammar, Spelling & Accents</span>
            </h1>
          </div>
          <p className="text-base md:text-lg text-neutral-600">AI-powered checker that fixes grammar, spelling, punctuation, accents, and agreement — plus native-style rewrites.</p>
        </header>

        <main className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <section className="md:col-span-2 bg-white/80 backdrop-blur-sm rounded-card shadow-lg p-6 animate-fadeIn">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={onCheck}
                disabled={loading || cooling || !text.trim()}
                className="inline-flex items-center gap-2 rounded-pill bg-gradient-to-r from-orange-500 to-red-500 text-white px-5 py-3 shadow-soft hover:shadow-lg transition disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50"
                aria-label="Check my Spanish"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spinSoft" />
                    Checking…
                  </>
                ) : (
                  <>
                    <Wand2 className="h-4 w-4" />
                    Check my Spanish
                  </>
                )}
              </button>

              <button
                onClick={onCopy}
                disabled={!text.trim() && !result?.corrected_text}
                className="inline-flex items-center gap-2 rounded-pill border border-orange-200 text-orange-700 px-4 py-2 bg-white hover:bg-orange-50 transition disabled:opacity-50 disabled:pointer-events-none"
                aria-label="Copy text"
              >
                <Copy className="h-4 w-4" />
                {copyFeedback || 'Copy'}
              </button>
              <button
                onClick={onClear}
                disabled={!text.trim()}
                className="inline-flex items-center gap-2 rounded-pill border border-orange-200 text-orange-700 px-4 py-2 bg-white hover:bg-orange-50 transition disabled:opacity-50 disabled:pointer-events-none"
                aria-label="Clear text"
              >
                <Trash2 className="h-4 w-4" />
                Clear
              </button>

              <span className="ml-auto text-xs text-neutral-500">{cooling ? 'Too many requests — cooling down. Please try again in a few seconds.' : ''}</span>
            </div>

            <div className="mt-4 space-y-2">
              <label className="text-sm text-neutral-700">Paste or type your Spanish text</label>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={3000}
                className="w-full min-h-[400px] p-4 rounded-card bg-white/50 border border-neutral-200/70 outline-none focus:ring-2 focus:ring-orange-500/50 placeholder:text-neutral-400 text-base leading-relaxed"
                placeholder="Write here… (up to 3,000 characters)"
              />
              {error && <div className="text-sm text-red-600">{error}</div>}

              <div className="mt-4 pt-4 border-t border-neutral-200/70 flex flex-col sm:flex-row items-center justify-between text-sm text-neutral-600">
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1"><FileText className="h-4 w-4" /> {text.length}/3000 characters</span>
                  <span className="inline-flex items-center gap-1"><AlertTriangle className="h-4 w-4 text-orange-600" /> {wordCount} words</span>
                </div>
                <div className="flex flex-row flex-wrap items-center gap-2 sm:gap-3">
                  <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs">Spelling {typeCounts['spelling'] || 0}</span>
                  <span className="px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 text-xs">Grammar {typeCounts['grammar'] || 0}</span>
                  <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-xs">Punctuation {typeCounts['punctuation'] || 0}</span>
                </div>
              </div>
            </div>
          </section>

          <aside className="md:col-span-1 space-y-6">
            <div className="bg-white/80 backdrop-blur-sm rounded-card shadow-lg p-6 animate-fadeIn">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-lg flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  Corrections
                </h2>
                <span className="px-2 py-0.5 rounded-full text-xs bg-orange-100 text-orange-700">{totalIssues}</span>
              </div>

              <div className="max-h-[400px] overflow-auto pr-2 space-y-2">
                {result?.corrections?.length
                  ? result.corrections.map((c, i) => (
                      <div key={i} className="border border-neutral-200 rounded-card p-3 hover:bg-orange-50 transition">
                        <div className="text-xs text-neutral-500 mb-1 uppercase tracking-wide">{c.type} • {Math.round((c.confidence ?? 0)*100)}%</div>
                        <div><strong className="text-neutral-900">{c.original}</strong> <span className="text-neutral-500">→</span> <span className="text-emerald-700">{c.suggestion}</span></div>
                        <div className="text-xs text-neutral-600 mt-1">{c.explanation_en}</div>
                      </div>
                    ))
                  : (
                    <div className="flex flex-col items-center justify-center py-8 text-center text-neutral-600">
                      <CheckCircle className="h-12 w-12 text-green-600 mb-2" />
                      <div className="font-semibold">No errors — your text looks excellent.</div>
                      <div className="text-sm">Your text looks excellent.</div>
                    </div>
                  )
                }
              </div>
            </div>

           
          </aside>
        </main>

        {/* Highlighted Preview (restored) */}
        <section className="rounded-card bg-white/80 backdrop-blur-sm shadow-lg p-6 animate-fadeIn">
          <div className="flex items-center gap-2 mb-2">
            <h2 className="font-semibold text-lg">Highlighted preview</h2>
            {(!result?.corrections?.length && text.trim()) ? (
              <span className="text-xs text-neutral-500">No issues detected.</span>
            ) : null}
          </div>
          <div className="min-h-24 p-3 rounded-card bg-white border border-neutral-200">
            {diffData?.spans?.length ? (
              <HighlightedPreview
                textNFC={canonical}
                corrections={diffData.spans as any}
                idPrefix="hunk-"
                titlesByIndex={diffTitles as any}
              />
            ) : (
              <span className="text-neutral-400 text-sm">—</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2 text-[11px] text-neutral-700 mt-2">
            <span className="px-2 py-0.5 rounded-full bg-red-100 border border-red-200">spelling</span>
            <span className="px-2 py-0.5 rounded-full bg-yellow-100 border border-yellow-200">grammar</span>
            <span className="px-2 py-0.5 rounded-full bg-blue-100 border border-blue-200">punctuation</span>
            <span className="px-2 py-0.5 rounded-full bg-purple-100 border border-purple-200">agreement</span>
            <span className="px-2 py-0.5 rounded-full bg-emerald-100 border border-emerald-200">accents</span>
            <span className="px-2 py-0.5 rounded-full bg-pink-100 border border-pink-200">diacritics</span>
            <span className="px-2 py-0.5 rounded-full bg-neutral-100 border border-neutral-200">other</span>
          </div>
        </section>

        <section className="rounded-card bg-gradient-to-r from-orange-50 to-red-50 shadow-lg p-6 animate-fadeIn">
          <h2 className="font-semibold text-lg mb-2">Corrected text</h2>
          <div className="min-h-24 p-3 rounded-card bg-white border border-neutral-200">
            {result?.corrected_text || <span className="text-neutral-400 text-sm">—</span>}
          </div>
          <h2 className="font-semibold text-lg mt-6 mb-2">Sound more natural (native-style rewrites)</h2>
          <div className="space-y-2">
            {result?.fluency?.alternatives?.length
              ? result.fluency.alternatives.map((a, i) => (
                  <div key={i} className="border border-neutral-200 rounded-card p-3 bg-white">
                    <div className="text-xs text-neutral-500">{a.register} • {Math.round((a.confidence ?? 0)*100)}%</div>
                    <div className="text-neutral-900">{a.suggestion}</div>
                    <div className="text-xs text-orange-700">{a.explanation_en}</div>
                  </div>
                ))
              : <div className="text-neutral-500 text-sm">No additional suggestions.</div>
            }
          </div>
        </section>


        <GrammarCheckerSection />
        <MasterSpanishSection />
      </div>
    </div>
  );
}
