# PRD — learnharness Mobile Access Point

Oct 29, 2026 · @Adi

> **Source of truth for LMobile.** This document wins over every other planning
> doc in this fork (including upstream's `docs/plan.md`, which covers upstream's
> roadmap, not mobile). `CLAUDE.md` wins on commands and house rules.
>
> **Decisions (Oct 29, 2026), applied below:**
> 1. Drafts save after 1 s of idle typing and flush on `visibilitychange`,
>    `pagehide`, and send via a `keepalive` fetch; last-writer-wins.
> 2. Success metrics are two gates only: 0 lost or duplicated answers (proven by
>    an automated cross-device test) and resume ≤ 3 s (cold and warm measured
>    separately). Adoption targets are dropped.
> 3. Headless host mode moves into Phase 1.
> 4. The Remote Gateway is built inside the Next server by extending `proxy.ts`,
>    not in Electron main, so it works on the desktop and on a headless host.
>
> **v1 core loop:** pair the phone by QR → open a session from the Learn tab →
> answer the pending question with confidence and thinking → watch the next turn
> stream in, nothing lost. Done when a stranger on an iPhone (Safari, installed
> PWA) completes it unaided.

## Summary

Build mobile access as an installable PWA served by the learner's own LearnHarness instance, reached over a private HTTPS tunnel. The desktop stays the single writer of every record, so there is nothing to merge: the phone is a second window onto the same server, not a second copy of the data.

**Problem.** LearnHarness is a local-first Electron app. Its server binds to `127.0.0.1` on a random port and rejects any API call without a per-launch secret header. Learning stops the moment the learner leaves the laptop, even though the most common learning moments (a commute, a queue, ten spare minutes) are exactly where a Socratic quiz loop fits best.

**Goals**

- Resume any session on the phone at the exact message, plan step, or pending question it was left at.
- Zero lost learner input: answers, confidence, thinking text, and drafts survive device switches, dropped connections, and app backgrounding.
- Full use of the configured model tiers (Strong, Cheap, Vision), BYOK keys, and subscription connections without any key ever reaching the phone.
- A touch-first interface for the core loop: read, predict, answer, think aloud (typed or dictated), continue.

**Non-goals (v1)**

- Running models or storing canonical data on the phone.
- Multi-user or shared hosting. One learner, one data directory.
- A cloud-replicated or CRDT-merged copy of the graph.
- App Store distribution of a native binary.

**Success gates (v1)**

| Gate | Target | Measured by |
| --- | --- | --- |
| Lost or duplicated learner answers across devices | 0 | Automated cross-device test: two clients answer, retry, and drop connections against one host; the record audit asserts exactly one answer per `toolCallId` |
| Resume to last position on a paired phone, **cold** (PWA launched from killed) | ≤ 3 s on 4G | Client timing from launch to transcript paint at the resume point |
| Resume to last position on a paired phone, **warm** (PWA foregrounded) | ≤ 3 s on 4G | Client timing from `visibilitychange` to resynced transcript paint |

Adoption metrics (cross-device sessions, mobile answer share, setup funnel) are
dropped for v1.

## Current architecture (what mobile builds on)

The repo is already shaped for a remote client: one server owns all state, the browser UI talks to it only over `/api/*`, and change is pushed over one SSE channel. Analyzed at commit `dc4c398` (v0.4.0, 29 Oct 2026).

**Correction to the brief.** The current tree does not depend on the Vercel AI SDK. The LLM loop runs on `@earendil-works/pi-ai` and `pi-agent-core` 1.4.0, and transcripts are stored as native `LhMessage` records (data format 1). The data-format reference calls older UIMessage transcripts an unsupported dialect. Next.js is 16.4 with React 19.2.

| Area | As built | Mobile implication |
| --- | --- | --- |
| Process model | Electron main spawns a standalone Next server on `127.0.0.1:<random port>` with `LH_DATA_DIR` pointing at userData (`electron/main.cjs`) | The phone cannot reach the server; a gateway is needed |
| API guard | `proxy.ts` rejects every `/api/*` call without the per-launch `x-learnharness-desktop` secret (`src/server/desktop-access.ts`); plain `npm run dev` has no auth at all | The secret must never leave the desktop; remote auth is a separate layer |
| Storage | Per-entity ports (`ChatStore`, `GraphStore`, `JobStore`) over fs adapters; chats are whole-file JSON, the graph is append-only JSONL; synchronous, single-process writes (`src/core/ports.ts`, `src/server/stores.ts`) | Two writers on two devices would break the one-writer law; keep one host |
| Session record | `data/chats/<id>.json` holds messages, plan tree, usage, per-session model settings, and `kind` (`teach` or `practice`) | The record already is the resume point |
| Turn protocol | `POST /api/chat` acknowledges and closes; every client attaches to `GET /api/chats/[id]/stream`, which replays the full turn event log, then streams live; a second concurrent turn gets 409 | Cross-device attach and double-submit protection exist today |
| Change delivery | One SSE channel, `GET /api/events`, notify-then-fetch (`turn-started`, `turn-settled`, `jobs-changed`, `activity-changed`, `chats-changed`), 25 s heartbeats, resync on reconnect | Phone and desktop stay live with no new sync protocol |
| Questions | `quiz`, `probe`, `ask_user_question` have no server execute; the client grades with browser-safe `question-core` and returns the verdict via `addToolOutput`; a pending quiz is persisted in the record | Mid-question resume is free; offline answering is feasible |
| Model tiers | `settings.json` slots `strong` / `cheap` / `vision`; roles map prober+teacher to Strong, researcher, demo builder, extractor, auditor to Cheap, visual maker and PDF reader to Vision (`ROLE_SLOT`, `src/core/settings.ts`); keys in `auth.json`, injected as env | Every model call runs on the host, so the phone gets all tiers for free |
| Background work | Research, demo builder (verified in headless system Chrome), visual maker (renders and inspects SVGs), PDF reader, extraction; one shared pool of 3 background LLM permits; results return as steer messages through the wake pipeline | Heavy agents must stay on the host; the phone only dispatches and views |
| Dictation | Server mints a 300 s Deepgram token (`/api/stt/token`); audio streams browser-to-Deepgram over WebSocket via an AudioWorklet | Works on mobile browsers, but only on an HTTPS origin |
| UI | Desktop-first: Electron drag bands, sidebar, docks, keyboard shortcuts; only \~14 responsive breakpoint uses across `components/`; Canvas 2D graph over d3-force with d3-zoom (touch pinch supported) | Needs a mobile shell, not a rewrite |

## Delivery decision: PWA on the learner's own host

Ship one codebase: the existing Next routes made responsive, wrapped in a mobile shell, plus a web manifest and an app-shell service worker, served from the host's own origin. It reuses every route, stream, and grader as-is and keeps a single writer.

| Option | How it works | Sync cost | Verdict |
| --- | --- | --- | --- |
| **PWA on host (recommended)** | Same Next server; responsive layouts + `MobileShell`; installable via manifest; reached through a tunnel | None: one server, one data dir | Build |
| Separate `/m` route tree | Parallel mobile-only pages calling the same APIs | None, but two UIs to maintain | Reject: duplicates 2,400+ lines of `chat.tsx` logic |
| Native app (Expo / React Native) | New client re-implementing the stream, question dock, and renderers | None, but re-implements KaTeX, Mermaid, markdown, grading | Defer: revisit only if iOS PWA limits block push or mic |
| Cloud replica with sync | Second copy of `data/` merged between devices | High: breaks one-writer-per-store; JSONL merge, chat record conflicts | Reject for v1 |

**Form-factor rule.** The mobile shell activates when the viewport is under 768 px wide or the pointer is coarse in standalone display mode. Desktop layouts stay byte-for-byte unchanged above that breakpoint, so the Electron window never regresses.

**PWA specifics**

- `app/manifest.ts` with `display: standalone`, theme colors for both themes, maskable icons from the existing `build/icon` set, `start_url: /?source=pwa`.
- Viewport export in `app/layout.tsx`: `viewport-fit=cover`, `interactive-widget=resizes-content`.
- Service worker caches the app shell and static chunks only. It never caches `/api/*` responses (the offline read cache lives in IndexedDB, see State sync).
- iOS home-screen install is required for Web Push (iOS 16.4+); onboarding prompts for it after pairing.

## 1. State synchronization and persistence

Sync by not syncing: the host's data directory is the only canonical store, both devices read and write it through the same API, and the existing events channel tells each device when truth moved. The phone keeps only a disposable read cache and an outbox.

&#91;embedded content: hub-and-spoke access · one host, two windows\]

The phone reaches the host only through the tunnel and gateway. Model calls, agents, and every write stay on the host; only dictation audio goes straight to Deepgram.

**Principles**

1. **One authority.** Chat records, graph ledgers, jobs, and settings live only in the host's `LH_DATA_DIR`. No ledger file is ever copied to the phone.
2. **The record is the resume point.** Opening a session on any device loads the record, then attaches to `/api/chats/[id]/stream`. A running turn replays from its first event; a settled one returns the terminal and the client refetches.
3. **Notify, then fetch.** Mobile subscribes to `/api/events` exactly as the desktop does. No new payload-bearing sync protocol.
4. **Idempotent learner input.** Every write the phone makes carries a deterministic key, so a retry after a dropped connection converges instead of duplicating.

**Requirements**

| ID | Requirement | Priority |
| --- | --- | --- |
| SYNC-1 | On session open, restore scroll position to the last unread assistant message or the pending question, whichever is later | P0 |
| SYNC-2 | A turn started on one device appears live on the other within one events round-trip (`turn-started` triggers attach, per the existing 409-race guard) | P0 |
| SYNC-3 | Answers to `quiz` / `probe` / `ask_user_question` are keyed by `toolCallId`; the server accepts the first and returns 409 with the canonical record for any later answer to the same call | P0 |
| SYNC-4 | Composer and question drafts persist server-side per session (new `drafts` store, PUT after 1 s of idle typing, flushed immediately on `visibilitychange` to hidden, `pagehide`, and send via `fetch(..., { keepalive: true })`; last-writer-wins by client timestamp) and show a "draft from Desktop" chip on the other device | P0 |
| SYNC-5 | Offline outbox in IndexedDB: a pending-quiz answer graded locally by `question-core` and any composed message queue while offline, then submit in order on reconnect through the normal routes | P1 |
| SYNC-6 | Read cache in IndexedDB: chat list, the last 10 opened session records, and the latest graph snapshot, each stamped with fetch time and shown read-only with a "last synced" label when the host is unreachable | P1 |
| SYNC-7 | The phone never calls `PUT /api/graph/positions`; desktop layout stays the authority, and the camera stays per-device in localStorage as today | P0 |
| SYNC-8 | ~~Every turn and answer records a `device` tag~~ Dropped with the adoption metrics (decision 2) | — |
| SYNC-9 | While any paired device holds an open events connection, the host requests an Electron `powerSaveBlocker` (`prevent-app-suspension`) so the server stays reachable; released 10 min after the last disconnect | P1 |

**Data-loss scenarios**

| Scenario | Behavior today | Required behavior |
| --- | --- | --- |
| Phone answers a quiz the desktop already answered | Second continuation could start a turn against a stale view | SYNC-3: 409, refetch, toast "Answered on Desktop" |
| Connection drops mid-turn | One read-only reattach, then error banner | Same, plus automatic reattach on `online` and on app foreground |
| iOS suspends the PWA mid-stream | Not handled (desktop never suspends) | On `visibilitychange` to visible: reconnect events, resync, reattach stream |
| Learner types a long thinking answer, then switches device | Draft is memory-only and lost | SYNC-4 draft restore |
| Host asleep or offline | Not applicable | Cached read view, outbox for answers, clear "Host offline" state with last-seen time |
| Both devices send a message at once | Second POST gets 409; `retryingFetch` merges unsent messages by id | Unchanged; the merge already preserves both inputs |

The extraction pipeline, practice graders, and job runner are untouched: they read the same record whichever device wrote it.

## 2. Mobile UI/UX architecture

The phone is built around one loop: read a short explanation, answer, think aloud, continue. Everything that is not that loop moves one tap away into a sheet or a tab.

**Shell.** `MobileShell` replaces the sidebar and top bar below the breakpoint. A bottom tab bar holds four destinations: **Learn** (sessions), **Graph**, **Practice**, **Activity**. Electron drag bands (`lh-drag`) and the traffic-light gutter render nothing in the shell.

**Session screen (the core surface)**

- Top bar, 48 px: back, session title (truncated), phase pill (`Probe` / `Plan` / `Teach`), plan-progress chip that opens the plan tree as a bottom sheet.
- Transcript: single column, 16 px side gutters, assistant prose at full width; tool and dispatch cards collapse to one-line summaries that expand on tap.
- Question dock becomes a bottom sheet that docks above the keyboard: options as full-width rows at least 48 px tall, the confidence rail as a segmented control, the thinking field below with a mic button inside it.
- Composer: sticky, respects `env(safe-area-inset-bottom)`, tracks `visualViewport` so it never hides behind the keyboard; Return inserts a newline on mobile and an explicit Send button submits (overrides `enter-submits`).
- Steer and abort: a running turn shows a slim progress bar with "Steer" and "Stop" actions, mapped to the existing steer route and abort dialog.

**Component adaptations**

| Desktop component | Mobile treatment |
| --- | --- |
| `sidebar.tsx` session list | Learn tab: list grouped Today / This week / Earlier, search on pull-down, swipe-left to delete with the existing confirm dialog |
| `question-dock.tsx` | Bottom sheet, large tap targets, drafts persisted (SYNC-4) |
| `plan-window.tsx`, plan blocks | Bottom sheet showing the derived plan tree as an indented list with current/visited/upcoming markers |
| `practice-dock.tsx`, `practice-cards.tsx` | One problem per screen, swipe between problems, answer field + dictation + Submit |
| `activity-dock.tsx` | Activity tab: running jobs with abort, finished results linking to their session |
| `graph-view.tsx` canvas | Graph tab opens a list view by default; canvas is an opt-in "Map" toggle (below) |
| Artifact cards (demo, visual) | Demo opens full-screen in its sandboxed frame with a close button; visuals fit width with pinch-zoom |
| Hover tooltips, `keyboard-shortcuts.tsx` | Long-press reveals tooltip content; shortcut hints hidden |
| File-path chips, path input, drop zone | Hidden (paths point at the host's disk); replaced by camera/photo attach where the Strong model accepts images |

**Knowledge graph on a phone.** Default to the chain table's hierarchy, which already exists as data: cluster (birth session) → reasoning chain → proposition statements, with fuzzy search over names, aliases, and statements. Tapping a proposition opens a sheet with its statement, its chains rendered as `A ∧ B ⟹ C`, and links to birth sessions. The canvas Map is read-only: pinch and pan via the existing d3-zoom touch handling, labels shown at closer zoom only, tap a node for the same sheet, no dragging. A "Practice these" action on any cluster or selection starts a practice session.

**Typography and readability**

| Element | Spec |
| --- | --- |
| Body prose | 17 px, line-height 1.55, max measure 68 characters |
| Headings in teaching prose | 20 / 18 px, weight 600 |
| Code, KaTeX display math, Mermaid, tables | Own horizontal scroll container; never widen the page |
| Tap targets | ≥ 44 × 44 pt, 8 px minimum spacing |
| Contrast | WCAG AA in both themes; respects `prefers-reduced-motion` and Dynamic Type up to 200% |

**Performance budget**

- Initial JS on the session route ≤ 250 KB gzipped; Mermaid, Rive, `@xyflow/react`, the graph canvas, and PDF code load lazily on first use.
- Transcripts render the last 40 messages first and virtualize upward on scroll.
- Time to interactive ≤ 2.5 s on a mid-range phone over 4G, measured through the tunnel.

## 3. Authentication and session continuity

Add a Remote Gateway inside the Next server by extending `proxy.ts` (decision 4). The proxy classifies every request as **desktop** (valid `x-learnharness-desktop` capability), **remote** (arrived on an allowlisted tunnel `Host`), or **local browser** (loopback dev mode), and authorizes remote requests only with a valid device credential and a granted scope. Because it lives in the server, the same gateway protects the Electron desktop and a headless host. The per-launch secret never leaves the host.

**Invariant:** the existing "no desktop secret configured means allow" branch of `desktopAPIAuthorized` applies only to direct loopback requests: a loopback `Host` and no `Forwarded` / `X-Forwarded-*` headers. A request on a tunnel hostname, or any relayed request, is never authorized by the absence of configuration. The pure core is `src/server/remote/classify.ts`; Phase 1 must confirm the Host and forwarding headers `tailscale serve` actually sends before wiring it into `proxy.ts`.

**Form factor before hydration (Phase 1).** Phase 0 decides the shell after hydration, so a phone paints the desktop UI for about 200-270 ms, and crossing 767 px remounts the tree. Phase 1 decides it before hydration (cookie or client hint, sticky per session) so a mounted composer is never swapped out.

**Threat model.** The host holds BYOK provider keys, subscription OAuth credentials, and a learner's full learning history. Anyone who can call `/api/chat` spends the learner's money. The gateway must stop: an unpaired device on the same network or tunnel, a stolen-but-revoked phone, DNS rebinding from a malicious web page, and token replay after logout.

**Remote Gateway (`proxy.ts`, Next server)**

- Off by default. Settings → Remote access toggles it (desktop), or `LH_REMOTE_HOSTS` sets it (headless); the tunnel targets the server's own port.
- The matcher widens from `/api/:path*` to the API, `/remote/*`, and app pages, so an unpaired device gets the "Pair this phone" screen rather than the app.
- Validates the device credential, the `Host` header against an allowlist (the tunnel hostname only), and `Origin` on state-changing requests.
- Authorizes in place (no forwarding hop), so SSE and the turn stream are unchanged.
- Rate-limits failed auth (5 per minute per IP, then 15 min lockout) and logs every remote request with device id to the activity feed.

**Pairing flow**

1. Learner enables Remote access; the desktop shows a QR code holding the tunnel URL and a one-time pairing code (128-bit, 5 min TTL, single use).
2. The phone opens the URL, the code is exchanged at `POST /remote/pair` for a device record: random id, name ("Adi's iPhone"), scopes, created time.
3. The gateway sets an `HttpOnly; Secure; SameSite=Strict` session cookie: a short-lived (15 min) JWT signed with a host-held key (`jose` is already a dependency), plus a 30-day rotating refresh token stored hashed on the host.
4. The desktop lists paired devices with last-seen time; "Revoke" deletes the refresh hash and bumps a key version so live JWTs die within 15 min, or instantly with "Revoke and rotate key".
5. Optional: require a device passkey (WebAuthn) on refresh for learners who want a second factor.

**Tunnel options**

| Option | Exposure | HTTPS (needed for mic + PWA install) | Fit |
| --- | --- | --- | --- |
| **Tailscale Serve (recommended default)** | Private tailnet only | Yes, MagicDNS certificate | Best: nothing public; gateway auth is a second layer |
| Cloudflare Tunnel + Access | Public hostname behind Cloudflare Access | Yes | Good when the learner cannot install Tailscale on the phone |
| ngrok or similar | Public URL | Yes | Dev and demos only |
| Plain LAN IP | Local network | No | Not supported: no mic, no install, no rebinding defense |

The gateway does not bundle a tunnel binary in v1. It detects a running `tailscale` CLI, offers a one-click `tailscale serve` command, and accepts any HTTPS URL the learner pastes.

**Route scopes for remote devices**

| Scope | Routes | Default for mobile |
| --- | --- | --- |
| `learn` | `/api/chat`, `/api/chats/**` (incl. stream, steer, settings, markdown), `/api/events`, `/api/search`, `/api/stt/token` | Granted |
| `graph:read` | `GET /api/graph`, `/api/graph/status`, `/api/graph/costs`, `/api/graph/render-settings` | Granted |
| `activity` | `/api/activity`, `/api/activity/abort`, `/api/jobs` | Granted |
| `models:read` | `GET /api/models`, `GET /api/settings` (with secrets redacted) | Granted |
| `graph:write` | Node DELETE, positions PUT, `/api/graph/import`, coverage extract | Denied (host only) |
| `admin` | `/api/keys/**`, `/api/settings/[section]` writes, `/api/custom-provider`, `/api/claude-code`, `/api/subscriptions/**` | Denied; never grantable remotely |

Unlisted routes are denied by default, so a new route added upstream stays host-only until it is explicitly scoped.

**Model tiers and API configuration.** Mobile needs no model configuration of its own. Every agent runs inside the host's server process, so Strong, Cheap, and Vision resolve through `piEngineFor` exactly as they do on the desktop, including subscription routes (ChatGPT, Copilot, Grok) owned by Electron main and a local Claude Code binary. The phone may change a session's model through `PUT /api/chats/:id/settings`, choosing only from models already configured; a 503 `models_not_configured` shows "Set up models on your desktop". Deepgram keys stay server-side; the phone receives only the 300 s token.

**Session continuity**

- Opening the PWA restores the last route and session (stored in localStorage, validated against the record).
- Refresh runs silently on foreground; an expired refresh token returns to a "Pair again" screen, never a blank app.
- A spend guard (P2) lets the learner cap remote-originated spend per day, using the turn usage the record already logs.

## 4. Feature parity vs mobile scope

Mobile gets the full interactive learning loop; heavy agents run only on the host and the phone dispatches, watches, and views their results. Nothing is computed on the phone except grading, which already runs client-side.

| Feature | Mobile v1 | Runs on | Notes |
| --- | --- | --- | --- |
| Continue a teaching session | Full | Host | Core use case; resume via record + stream |
| Start a new session (probe → plan → teach) | Full | Host | Strong slot stamped on creation, as today |
| Answer `quiz` / `probe` / `ask_user_question` with confidence and thinking | Full | Phone (grading) | `question-core` grades locally; SYNC-3 idempotency |
| Voice dictation | Full | Phone → Deepgram | HTTPS tunnel required; language preference shared app-wide |
| Chat history browse and search | Full | Host | Existing `/api/search` |
| Practice sessions | Full | Host | One problem per screen |
| Steer mid-turn, stop a turn | Full | Host | Existing steer route and abort |
| Per-session model and thinking level | Full | Host | Configured models only |
| Plan tree | Read | Host | Bottom sheet |
| Knowledge graph | Read | Host | List view + read-only map; no delete, no layout writes |
| Cost meter | Read | Host | From turn usage |
| Photo of handwritten work or a textbook page | P1 | Host | Only when the session's model accepts images |
| Research job | Dispatch + view | Host (Cheap) | Teacher dispatches as today; result card in transcript |
| Demo builder | View only | Host (Cheap + headless Chrome) | Full-screen sandboxed viewer |
| Visual maker | View only | Host (Vision) | Fit-width SVG with pinch-zoom |
| PDF reading | URL only | Host (Vision) | Host file paths hidden on mobile |
| Graph extraction | None (automatic) | Host (Cheap) | Coverage ring shown read-only |
| Notes import, node deletion | Desktop only | Host | `graph:write` scope |
| Keys, providers, subscriptions, prompts | Desktop only | Host | `admin` scope, never remote |

**Background agents on mobile.** The wake pipeline already holds a finished job's result until the session is turn-free, question-free, and consented, so a result never interrupts an answer in progress. Mobile adds visibility around that:

- Dispatch cards show live status from `jobs-changed`; the Activity tab lists every running worker with Stop.
- **Web Push (P1).** The host sends a push via VAPID when a job finishes, a turn settles while the app is backgrounded, or a practice answer is graded. Payloads carry only an event type and session id, never transcript content, matching the notify-then-fetch law. Tapping opens the session at the new message.
- Background consent stays per provider and default on; a mobile toggle "Run background agents while I'm away" maps to the existing pause control.

**Explicitly out of mobile scope:** running any agent on the phone, offline model calls, editing system prompts, and graph management (the chain table's delete and bulk actions).

## Rollout, risks, open questions

Ship in three phases, each closed by a gate; the first phase alone delivers the core promise of answering a pending question from the phone without losing anything.

&#91;embedded content: rollout · 3 phases, 3 gates\]

Each phase starts only when the previous gate passes; durations are set after Phase 1 scoping.

**Risks**

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Host laptop sleeps or lid closes | Phone shows "Host offline" | SYNC-9 power blocker while connected; read cache + outbox; headless host mode on an always-on machine in Phase 1 |
| iOS kills SSE when the PWA backgrounds | Missed live updates | Resync and reattach on foreground (already the reconnect law); Web Push for completions |
| Remote access exposes paid API keys | Unauthorized spend | Off by default, tailnet-first, device tokens, deny-by-default scopes, `admin` never remote, spend guard |
| `chat.tsx` (2,466 lines) resists a responsive split | Slower Phase 1 | Extract layout from logic first: session state hooks stay shared, only the frame differs |
| Upstream changes routes or storage | Gateway scopes drift | Deny-by-default scopes; a CI test lists every `app/api` route and fails on any unscoped one |
| AGPL-3.0 obligations | A modified, network-served build must offer its source to its users | Personal use is fine; if offered to others, link the source from the PWA's About screen, or upstream the work |

**Headless host mode (Phase 1).** A standalone server on an always-on Mac mini or VPS with its own `LH_DATA_DIR` and `LH_REMOTE_HOSTS`, no Electron. The gateway in `proxy.ts` covers it unchanged; SYNC-9's power blocker is desktop-only and a no-op here.

**Open questions**

- [x] Headless host mode: Phase 1 (decision 3).
- [x] Fork or upstream: upstream-friendly fork (`Cyber-Adi/learnharness`); propose the gateway upstream later.
- [x] Draft sync cadence: 1 s idle + flush on hide/pagehide/send (decision 1).
- [ ] Should mobile be allowed to start practice sets from a graph selection in v1, or only continue existing practice sessions? (Out of the v1 loop until decided.)
- [x] Success metrics: two gates (decision 2).

**Sources**

- [amosblomqvist/learnharness](https://github.com/amosblomqvist/learnharness), commit `dc4c398`: `README.md`, `docs/architecture.md`, `docs/development.md`, `skills/learnharness/references/data-format.md`, `config.ts`, `proxy.ts`, `src/server/desktop-access.ts`, `src/core/ports.ts`, `src/core/settings.ts`, `app/api/chats/[id]/stream/route.ts`, `app/api/stt/token/route.ts`, `electron/main.cjs`, `next.config.ts`, `package.json`
