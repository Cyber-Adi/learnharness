# Lessons

One row per class of mistake. Format: **seen** (what happened or what we expect
to happen), **why**, **rule**, **enforcing test**. A rule without a test is a
wish: write the test, or write "review" and say who checks it.

## Inherited (cheap on day 0, expensive later)

| Seen | Why | Rule | Enforcing test |
| --- | --- | --- | --- |
| A visible control does nothing | Optional handler never passed | A control with an optional handler renders only when the handler exists | `tests/mobile-shell-*`: reload control renders only with a handler |
| Primary action off-centre after a tab was removed | Layout split by a hard-coded `slice` | Layout holds for any item count; never split by `slice` | `tests/mobile-shell-*`: tab bar holds for 1, 2 and 5 tabs |
| The whole surface shows an error | One enhancement source failed | Enhancement sources degrade to empty; only the primary source drives the error state; AI is never the only path to a core-loop result | Hook test per data source (Phase 1) |
| A route exists that no one can reach | Added without a nav entry | Every route is reachable from the UI | `tests/mobile-shell-*`: every tab href resolves to an app route |
| A test goes red on its own weeks later | Fixture dates passed real time | Fixtures with absolute dates pin the clock | `mock.timers` in any date-dependent test |
| Hooks and gestures were untestable | Logic lived inside components | Extract the pure core (`resolveFormFactor`, `staggerDelay`, `viewportVar`) and test that | Unit tests next to each pure core |
| Animation bugs hidden by mocks | The motion library was mocked | Run component tests against the real `motion`; mock only boundaries we own (haptics, env) | Test setup review; `tests/mobile-motion-*` imports real `motion` |
| `vi.mock` hoisting bugs and leaked restores | Mock factory ordering | (node:test here) Use `mock.method` inside the test and `t.mock` for automatic restore; never global restore in a test body | Review |
| Server functions leaked DB errors | Raw errors returned | Auth plus ownership check, zod input validation, generic 500s, nothing raw to clients | `tests/mobile-remote-*`: the error envelope never echoes input |
| Data loss from a migration | Destructive change applied by an agent | Storage changes are additive and idempotent; destructive changes are a proposal a human applies | Review |
| "Done" but invisible on the phone | Checked only in jsdom/desktop | A visual change is done only when visible on device at 390x844 and 375x667, with before/after screenshots | PR template and the device pass |
| Dead containers after a UI removal | Removed the child, not the slot | When a task removes UI, re-check every container and route that held it | Review checklist |

## LMobile-specific

| Seen | Why | Rule | Enforcing test |
| --- | --- | --- | --- |
| Risk: a headless host behind a tunnel accepts every API call | `desktopAPIAuthorized` returns true when no desktop secret is configured (browser mode) | An unset desktop secret never authorizes a remote request; only loopback-hosted requests get the browser-mode pass | `tests/mobile-remote-*`: a remote request is not authorized by the absence of a desktop secret |
| Risk: DNS rebinding reaches the host from a web page | Host header not checked | Requests whose Host is neither loopback nor on `LH_REMOTE_HOSTS` are rejected | `tests/mobile-remote-*`: an unknown Host is rejected |
| Risk: a new upstream route becomes remotely reachable | Allow-by-default scoping | Route scopes deny by default; every `app/api` route must map to a scope, and `admin`/`graph:write` are never remote | `tests/mobile-remote-*`: every app/api route method has a scope |
| Risk: the per-launch secret leaks to the phone | Forwarding by copying headers | `x-learnharness-desktop` never leaves the host; the gateway authorizes in place in `proxy.ts` | Gateway tests (Phase 1) |
| Risk: the phone overwrites the desktop graph layout | Positions written from two devices | The phone never calls `PUT /api/graph/positions` | Scope test: `graph:write` is never remote |
| Risk: a duplicated answer after a dropped connection | Retry of a non-idempotent write | Learner answers are idempotent by `toolCallId`; the first answer wins, later ones get 409 plus the canonical record | Cross-device gate test (Phase 1) |
| Risk: a push or SSE payload leaks transcript content | Payload-bearing notifications | Notify, then fetch: payloads carry event type and ids, never content | Payload schema test (Phase 1+) |
| Risk: a narrow Electron window flips into the mobile shell | A width-only form-factor rule | Electron is always desktop; the shell is behind `NEXT_PUBLIC_LH_MOBILE_SHELL` until Phase 1 | `tests/mobile-shell-*`: Electron is always desktop; a disabled flag is always desktop |
| An upstream test fails locally but not in CI | `render-sidebar.test.tsx:84` formats a UTC fixture in local time | Our test scripts pin `TZ=UTC`; any date-formatting test pins the timezone | `npm run test:mobile` sets `TZ=UTC` |
| `next dev` rewrote upstream's `AGENTS.md` on start | Next 16 writes agent rules unless `agentRules: false` | Check `git status` for `AGENTS.md` before every commit; revert unintended rewrites | Review (pre-commit) |
