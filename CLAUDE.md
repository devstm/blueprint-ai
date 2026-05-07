# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev      # Start dev server (Turbopack, port 3000)
npm run build    # Production build
npm run start    # Run production build
npm run lint     # Run ESLint (calls `eslint` directly — not `next lint`)
```

No test suite is configured.

## Architecture

**Blueprint AI** is a Next.js 16 App Router application. It's a conversational database schema designer: the user describes their app in chat, and the AI asks clarifying questions until it has enough context to emit production-ready Supabase/PostgreSQL SQL (tables with UUID PKs, RLS, snake_case, migration file).

- [app/page.tsx](app/page.tsx) — landing page (currently placeholder, needs UI)
- [app/layout.tsx](app/layout.tsx) — root layout with Geist fonts, full-height flex body
- [app/api/chat/route.ts](app/api/chat/route.ts) — POST route handler; calls Groq SDK (`llama-3.3-70b-versatile`) with a hardcoded `SYSTEM_PROMPT` that defines the BlueprintAI persona and schema-generation rules
- [app/globals.css](app/globals.css) — Tailwind v4 (uses `@import "tailwindcss"`, not the `@tailwind` directives)

**External dependency:** Groq SDK (`groq-sdk`). Requires `GROQ_API_KEY` in `.env.local`.

## Next.js 16 — Key Differences from Prior Versions

- **Turbopack is the default** bundler for both `next dev` and `next build`. No flag needed.
- **`next lint` is removed.** Use `eslint` directly (already reflected in `package.json` scripts).
- **`next build` no longer runs lint** as part of the build.
- **Middleware renamed to `proxy`.** File is `proxy.ts` (not `middleware.ts`); export is `export function proxy()`. The `edge` runtime is not supported in `proxy` — keep using `middleware.ts` if you need edge.
- **`serverRuntimeConfig` / `publicRuntimeConfig` removed.** Use `process.env` directly in Server Components, or `NEXT_PUBLIC_` prefix for client-accessible values.
- **`experimental.dynamicIO` renamed to `cacheComponents`** (top-level `next.config` key).
- **`unstable_` prefix removed** from previously-stabilized APIs (e.g. `unstable_cache` → `cache`).
- **AMP support removed** entirely.
- **`params` in dynamic routes is now a Promise** — must be `await`ed: `const { id } = await params`.
- Minimum Node.js: 20.9.0. Minimum TypeScript: 5.1.
