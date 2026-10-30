# LMobile

A fork of LearnHarness (`amosblomqvist/learnharness`, AGPL-3.0) that lets one
learner continue their own sessions from an iPhone as an installable PWA, served
by their own host (desktop or headless) over a private HTTPS tunnel. The host is
the only writer; the phone is a second window onto the same server.

Read upstream's `AGENTS.md` and `docs/architecture.md` for the app itself. This
file only covers the mobile fork. If they conflict on mobile work, this file wins.

## Source of truth

- Plan: `docs/PRD-mobile-access.md` (Decisions block at the top). It wins over
  `docs/plan.md` and every other planning doc, which describe upstream's roadmap.
- Commands and house rules: this file.
- Lessons: `docs/LESSONS.md` (seen / why / rule / enforcing test). Read it before
  any UI or gateway brief.

## The v1 core loop

Pair the phone by QR -> open a session from the Learn tab -> answer the pending
question with confidence and thinking -> watch the next turn stream in, nothing
lost or duplicated. v1 is done when a stranger on an iPhone (Safari, installed to
the home screen) completes it unaided.

Gates: 0 lost/duplicated answers (automated cross-device test); resume <= 3 s,
cold and warm measured separately.

## Out of scope until the owner says otherwise

Graph list/map, practice, Activity tab, starting new sessions from mobile, Web
Push, offline outbox and read cache (SYNC-5/6), photo attach, spend guard,
passkeys, device-tag metrics, everything on the PRD's "Desktop only" list.
Headless host mode is Phase 1.

## Stack

Upstream's, unchanged: Next 16.4 (App Router; `proxy.ts` is the middleware),
React 19.2, Tailwind v4, Radix, `motion` 13, zod 4, jose 6, Electron 44,
`node:test` via `tsx`. Fork additions: `c8` (coverage), `@playwright/test` (e2e).
This Next has breaking changes: read `node_modules/next/dist/docs/` before using
a Next API.

## Commands

| Task | Command |
| --- | --- |
| Dev server (browser mode) | `npm run dev` |
| Desktop dev (Electron) | `npm run desktop:dev` |
| Build | `npm run build` |
| Typecheck | `npm run typecheck` (Playwright files: `npm run typecheck:e2e`) |
| Lint (upstream import law) | `npm run lint` |
| All tests (upstream + ours) | `npm test` |
| Our tests only | `npm run test:mobile` |
| Coverage gate (80%, our code) | `npm run coverage:mobile` |
| E2E (390x844, 375x667, 1440x900) | `npm run e2e` (first: `npm run e2e:install`) |
| Full mobile gate | `npm run check:mobile && npm run e2e` |
| Regenerate PWA icons | `npm run icons` |

Browser checks against `next dev` use `http://localhost:<port>`, never
`127.0.0.1` (Next 16 blocks dev resources there, so the page never hydrates).
Only one `next dev` can run per checkout. `next dev` rewrites `AGENTS.md`:
revert it before committing.

Baseline: `npm test` has one upstream failure, `tests/render-sidebar.test.tsx:84`,
which depends on the timezone (it passes under `TZ=UTC`, as in CI). Our scripts pin
`TZ=UTC`.

## Where code goes (live / upstream map)

| Path | Owner | Notes |
| --- | --- | --- |
| `components/mobile/**` | fork | Shell, form factor, motion tokens, haptics, `mobile.css` |
| `src/server/remote/**` | fork | Gateway pure core: scopes, classify, schemas, error envelope |
| `proxy.ts` | shared | Gateway wiring lands here in Phase 1 (decision 4) |
| `app/layout.tsx`, `app/globals.css` | shared | Lead-only edits; keep diffs minimal |
| `app/manifest.ts`, `public/icons/` | fork | PWA manifest and icons |
| `tests/mobile-*.test.ts(x)` | fork | Flat, so upstream's `npm test` glob runs them |
| `e2e/`, `playwright.config.ts`, `.c8rc.json`, `.github/workflows/mobile.yml` | fork | Harness |
| everything else | upstream | Don't edit without a reason written in the PR |

The import law is enforced by eslint: `components/**` imports `src/` only via
`@/src/core`; `app/**` only via `@/src/core` and `@/src/server`.

## House rules

- Branches plus PRs into the fork's `main`; never commit to `main`; never open PRs
  upstream without the owner. Conventional commits, one concern per commit, and
  tests ship in the same commit as the behaviour they prove.
- TDD: a failing test first, including for every bug fix (named after the symptom).
  Test pure cores; mock only boundaries we own (haptics, env), never `motion` or React.
- zod at every external input; the typed error envelope from
  `src/server/remote/errors.ts`; no raw errors or input echoed to clients.
- Secrets come only from env or host-held files. `LH_DESKTOP_API_SECRET` never
  leaves the host and never goes into a file. See `.env.example`.
- The desktop must not regress: every mobile selector is scoped under
  `[data-lh-mobile]`, and the shell is behind `NEXT_PUBLIC_LH_MOBILE_SHELL=1` until
  Phase 1. Electron is always desktop.
- No `any`, no emojis, immutable data, files under 400 lines.

## UI and motion budgets

44pt hit areas with 8px spacing; 12px text floor; prose at 17px / 1.55 / 68ch;
at most two live blurs and no full-screen blurs; animate transform/opacity only;
<= 300 ms; tokens from `components/mobile/motion.ts` (never inline springs);
materials only through `.lh-m-glass` / `.lh-m-scrim`, which have opaque
fallbacks; prefers-reduced-motion gives a complete static version; session-route
JS <= 250 KB gzipped. A visual change is done only when it is visible on device at
390x844 and 375x667, with before/after screenshots.
