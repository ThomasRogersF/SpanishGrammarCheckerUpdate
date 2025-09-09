# Spanish Grammar Checker (V1) — Vite + React + TypeScript + Gemini

Single-button Spanish grammar checker with strict JSON validation, server-kept secrets, NFC span guards, and minimal UI.

Key features:
- Click-to-check only (no typing-time calls)
- Strict JSON contract validated by Ajv
- NFC normalization with in-bounds, non-overlapping span guards
- Server keeps secrets; client calls `/api/check`
- Timeouts and one retry for robustness
- 2-second cooldown after successful check to avoid accidental repeats

---

## Prerequisites

- Node 18+ (required for native `fetch` on the server)
- npm

---

## Quick Start

1) Install dependencies

```bash
npm i
```

2) Create env file

Copy `.env.local.example` to `.env.local` and set your real Gemini key:

```
GEMINI_API_KEY=YOUR_REAL_KEY
GEMINI_MODEL=gemini-1.5-flash
```

Notes:
- Do NOT use `VITE_` prefix. These env vars are server-only and never shipped to the client.
- `.gitignore` blocks `*.local` by default, so your key won’t be committed.

3) Run dev

```bash
npm run dev
```

Open http://localhost:5173

4) Use

- Paste Spanish text
- Click “Check”
- You’ll see:
  - Corrected text
  - Corrections with suggested fix + English explanation
  - Optional fluency alternatives (may be empty)

---

## Acceptance Criteria Mapping

- Clicking Check calls `/api/check` once, not during typing
  - Implemented in [App.tsx](src/App.tsx:1) with `fetch('/api/check', { method: 'POST' })`
- Strict JSON validation via Ajv and formats
  - Implemented in dev API [index.ts](api/index.ts:1) and Vercel function [check.ts](api/check.ts:1)
- NFC spans guarded (no overlaps, in-bounds)
  - Guard in [assertSpans()](api/index.ts:63)
- Server-only secrets
  - Dev server mounts Express middleware inside [vite.config.ts](vite.config.ts:1) (no secrets in bundle)
  - Production uses [api/check.ts](api/check.ts:1) on Vercel; set env there
- Input > 3000 chars returns a friendly error
  - Enforced in [index.ts](api/index.ts:131) and [check.ts](api/check.ts:157)
  - Client shows error banner from [App.tsx](src/App.tsx:62)
- Timeouts + one retry
  - [fetchWithTimeout()](api/index.ts:121) and retry logic in handler
- Cooldown (2s) after success
  - Implemented in [App.tsx](src/App.tsx:79)

---

## Architecture

### Client (React)

- UI: [App.tsx](src/App.tsx:1)
  - Textarea with maxLength=3000
  - Single “Check” button (disabled when loading/cooling/empty)
  - 2s cooldown after a successful check
  - Renders corrected text, issues with explanations, and fluency alternatives
- Styles: Tailwind v3 (inline PostCSS config in Vite to avoid ESM/CJS issues)
  - Global CSS: [styles.css](src/styles.css:1)
  - Entry: [main.tsx](src/main.tsx:1)

### Dev API (Express middleware inside Vite)

- Mounted within [vite.config.ts](vite.config.ts:1) under a custom dev plugin (`configureServer`)
- Routes implemented in [api/index.ts](api/index.ts:1)
- Runtime-friendly JS twin [api/index.js](api/index.js:1) to avoid TS execution issues when dynamically importing from Vite
- Server-only env loaded from `.env.local` (not exposed to client)

### Production API (Vercel)

- Serverless function: [api/check.ts](api/check.ts:1)
- Same schema, guards, and timeout logic as dev
- Set `GEMINI_API_KEY` and `GEMINI_MODEL` in Vercel project environment variables
- Client keeps calling `/api/check` (same origin)

---

## Strict JSON Schema (V1)

Validated with Ajv (`ajv` + `ajv-formats`):

- version: `"1.0"`
- language: `"es"`
- normalized: `true`
- corrected_text: `string`
- corrections: array of:
  - `{ start, end, original, suggestion, type, explanation_en, confidence }`
  - `type` ∈ `spelling | grammar | punctuation | agreement | accent | diacritic | other`
  - `confidence` ∈ [0,1]
- fluency:
  - `{ alternatives: [{ suggestion, register, explanation_en, confidence }] }`
  - `register` ∈ `neutral | formal | informal`
- meta: optional object

Spans are 0-based indices in NFC-normalized input; `end` is exclusive. Spans must not overlap and must be within bounds.

---

## Files of Interest

- Dev middleware and inline PostCSS to avoid ESM/CJS pitfalls:
  - [vite.config.ts](vite.config.ts:1) — `export default defineConfig()` with:
    - Inline PostCSS: `tailwindcss()` and `autoprefixer()`
    - Dev inline API plugin mounting Express middleware
- Dev API:
  - [api/index.ts](api/index.ts:1) — `export default function (app: Express)` mounts `/api/check`
  - [api/index.js](api/index.js:1) — JS twin for Node runtime
- Production API:
  - [api/check.ts](api/check.ts:1) — `export default async function handler(req, res)`
- UI:
  - [src/App.tsx](src/App.tsx:1)
  - [src/main.tsx](src/main.tsx:1)
  - [src/styles.css](src/styles.css:1)
- Tailwind/PostCSS:
  - [tailwind.config.cjs](tailwind.config.cjs:1)
  - [postcss.config.cjs](postcss.config.cjs:1)

---

## Error Handling

Server returns structured errors; client shows a small error message:
- 400: Missing text
- 413: Input too long (> 3000 chars)
- 500: Missing `GEMINI_API_KEY` or internal server errors
- 502: Upstream HTTP error or JSON schema validation failure

Cooldown:
- After a successful response, the Check button is disabled for 2 seconds.

---

## Troubleshooting

- Still seeing PostCSS ESM/CJS errors?
  - We inline PostCSS config in [vite.config.ts](vite.config.ts:1) via:
    ```ts
    css: { postcss: { plugins: [tailwindcss(), autoprefixer()] } }
    ```
  - Additionally, a CJS file is provided at [postcss.config.cjs](postcss.config.cjs:1). Vite should pick the inline config regardless.

- 500 “Missing GEMINI_API_KEY on server”
  - Ensure `.env.local` exists with `GEMINI_API_KEY` (no `VITE_` prefix).
  - Restart dev server after adding `.env.local`.

- JSON validation failures (502)
  - Logged on server; adjust prompt or retry.

- Double-clicks causing quota drain
  - A 2-second cooldown is implemented; button disables automatically after success.

---

## Deploying to Vercel

- Keep the project root structure. Vercel will detect `api/check.ts` automatically.
- Set environment variables in Vercel:
  - `GEMINI_API_KEY`
  - `GEMINI_MODEL` (optional; defaults to `gemini-1.5-flash`)
- The client continues to call `/api/check`.

---

## Future (V2) Ideas

- Quota safety: smarter rate-limiting per client
- User dictionary: an “Allowed words” textarea appended to the prompt
- Register toggle: neutral/formal/informal preference for fluency
- Client-side analytics (no text captured), for prompt iteration
