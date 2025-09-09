/// <reference lib="dom" />
import type { Express, Request, Response } from 'express';
import bodyParser from 'body-parser';
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

// --- helpers
const toNFC = (s: string) => s.normalize('NFC');

function assertSpans(corrections: any[], textLen: number) {
  const spans = corrections.map((c, i) => ({ i, start: c.start, end: c.end }))
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
- Analyze the NFC-normalized Spanish text between triple bars.
- Produce THREE layers: (1) CORRECTION, (2) EXPLANATION in ENGLISH, (3) FLUENCY.

RESPONSE FORMAT (IMPORTANT)
- Return ONLY a strict JSON object that conforms exactly to:
  version:"1.0"; language:"es"; normalized:boolean; corrected_text:string;
  corrections:[{start,end,original,suggestion,type,explanation_en,confidence}];
  fluency:{alternatives:[{suggestion,register,explanation_en,confidence}]};
  meta: optional object.
- Indices are 0-based; end is exclusive; indices refer to the NFC-normalized input.
- Corrections MUST NOT overlap. corrected_text applies ALL corrections (no fluency).

GUIDELINES
- Keep the user's meaning; only fix actual errors in CORRECTION.
- Types: spelling, grammar, punctuation, agreement, accent, diacritic, other.
- Explanations: brief, rule-based, in English.
- Fluency alternatives may be empty if already natural.

INPUT (NFC):
|||${nfc}|||

OUTPUT: JSON ONLY (no markdown or prose).
`.trim();
}

// tolerate ```json fences
function extractFirstJson(str: string) {
  const fenced = str.match(/```json\\n([\\s\\S]*?)\\n```/);
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

export default function (app: Express) {
  app.use(bodyParser.json({ limit: '1mb' }));

  app.post('/api/check', async (req: Request, res: Response) => {
    try {
      const KEY = process.env.GEMINI_API_KEY;
      const MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
      if (!KEY) return res.status(500).json({ error: 'Missing GEMINI_API_KEY on server' });

      const input = (req.body?.text ?? '').toString();
      if (!input.trim()) return res.status(400).json({ error: "Missing 'text'" });
      if (input.length > 3000) return res.status(413).json({ error: 'Input too long (max 3000 chars)' });

      const nfc = toNFC(input);
      const prompt = buildPrompt(nfc);
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

      const data = await r.json();
      const textPart = (data as any)?.candidates?.[0]?.content?.parts?.[0]?.text;
      const obj = textPart ? extractFirstJson(textPart) : data;

      const ajv = new Ajv({ allErrors: true, strict: false });
      addFormats(ajv);
      const validate = ajv.compile(schema);
      if (!validate(obj)) return res.status(502).json({ error: 'JSON failed schema validation', issues: validate.errors });

      assertSpans(obj.corrections || [], nfc.length);
      if (obj.normalized !== true) return res.status(502).json({ error: 'Model must set normalized=true for NFC indices' });

      res.json(obj);
    } catch (e: any) {
      res.status(500).json({ error: 'Server error', detail: String(e?.message || e) });
    }
  });
}