import { useMemo, useState } from 'react';

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

  const now = Date.now();
  const cooling = useMemo(() => now < coolingUntil, [now, coolingUntil]);

  const onCheck = async () => {
    if (loading || cooling || !text.trim()) return;
    setError(null); setLoading(true);
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
                  <div key={i} className="border border-slate-700 rounded-md p-2">
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
