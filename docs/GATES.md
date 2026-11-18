# v1 gates

Both gates come from the PRD's Decisions block.

| Gate | How it is checked | Command |
| --- | --- | --- |
| 0 lost or duplicated answers | Automated cross-device test against the real chat handler | `npm run test:mobile` (`tests/mobile-cross-device.test.ts`) |
| Resume <= 3 s on 4G, cold and warm measured separately | Production build, Lighthouse Slow 4G (150 ms RTT, 1.6 Mbps down, 750 Kbps up) plus 4x CPU, worst of 5 runs | `npm run e2e:perf` |

## Resume measurement (`e2e/perf/resume.perf.ts`)

- **Cold, installed:** the PWA is launched from killed with its cache warm from an earlier launch. The time is launch to Learn painted, plus the tap to the session painted with its Answer bar. The learner's own time before tapping is not counted.
- **Cold, first launch:** the same flow in a fresh browser context with no cache.
- **Warm:** the PWA is backgrounded, the desktop settles the pending question, and the PWA is foregrounded. The time is from `visibilitychange` to the resynced transcript painted (Answer bar gone, reply box shown).

A mark is the animation frame after the condition first holds, so it counts as painted.

Limits:
- **Simulated background:** a Playwright page cannot really be backgrounded. The warm run overrides `document.visibilityState` and dispatches the event that `use-foreground-sync` listens for.
- **Dismissal, not an answer:** the warm trigger is a desktop dismissal, which is turn-less and needs no model key. An answer would need a provider key on the test host.
- **Not a phone:** these are Chromium numbers on a laptop with throttling. The iPhone checklist (`docs/DEVICE-CHECKLIST.md`) repeats both resumes by stopwatch on the device.

The Next CLI sometimes exits early while starting the web server ("Process from config.webServer was not able to start"). Rerun when that happens.

## Latest run (2026-11-17, iphone-13 profile)

| Resume | Median | Worst of 5 | Budget |
| --- | --- | --- | --- |
| Cold, installed | 832 ms | 866 ms | 3000 ms |
| Cold, first launch | 1663 ms | 1818 ms | 3000 ms |
| Warm | 196 ms | 202 ms | 3000 ms |

The harness was mutation-checked:
- At 3000 ms latency, cold fails at 6493 ms.
- With the foreground resync removed, warm fails ("never resynced").
