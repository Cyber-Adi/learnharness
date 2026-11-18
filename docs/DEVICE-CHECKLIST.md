# iPhone device pass

v1 is done when a stranger on an iPhone (Safari, installed to the home screen) completes the core loop unaided. This is the script for that pass. Run it on a real iPhone over cellular (Wi-Fi off) unless a step says otherwise.

Record every step as pass or fail, with the iOS version, the phone model and a note. Anything that fails gets a screenshot or screen recording, plus a row in `docs/LESSONS.md` once it is fixed.

## 0. Before you start (host)

1. Build and start the host with the shell on (see `docs/HOST.md`):
   `LH_REMOTE_HOSTS=<your-host>.ts.net LH_DATA_DIR=<data dir> PORT=3210 npm run host`
2. Expose it: `tailscale serve --bg https / http://127.0.0.1:3210`
3. Have at least two sessions on the host: one waiting on a quiz question, and one that ended on an open question in prose.
4. Make sure the phone is on the same tailnet (Tailscale app signed in) and the desktop app is open on the same host.

## 1. Capture the real Tailscale headers (once; replaces skipped step A2)

The gateway's "local vs relayed" rule (`docs/LESSONS.md`) was built from Next's own headers, not from what `tailscale serve` really sends. Capture them once:

1. On the host, start a throwaway echo server:
   `node -e 'require("http").createServer((q,s)=>{s.setHeader("content-type","application/json");s.end(JSON.stringify({host:q.headers.host,headers:q.headers},null,2))}).listen(3211,"127.0.0.1")'`
2. Point the tunnel at it: `tailscale serve --bg https / http://127.0.0.1:3211`
3. Open `https://<your-host>.ts.net/` on the phone and copy the JSON.
4. Put the tunnel back: `tailscale serve --bg https / http://127.0.0.1:3210`, then stop the echo server.
5. Redact `Tailscale-User-Login`, `Tailscale-User-Name` and `Tailscale-User-Profile-Pic` (personal data), and save the result as `e2e/fixtures/tailscale-headers.json`. Tell the lead which forwarding headers were present: `Forwarded`, `X-Forwarded-For`, `X-Forwarded-Host` and `X-Forwarded-Proto`.

| Check | Expected | Pass/fail |
| --- | --- | --- |
| Host header | `<your-host>.ts.net` | |
| `X-Forwarded-For` | the phone's tailnet IP (100.x) | |
| `X-Forwarded-Proto` | `https` | |

## 2. Pair and install

| # | Step | Expected | Pass/fail |
| --- | --- | --- | --- |
| 2.1 | Desktop: Settings, then Phone; or `npm run host:pair` on a headless host | A QR code and a short code | |
| 2.2 | Phone: scan the QR with the Camera app | Safari opens the pair page, already filled in | |
| 2.3 | Confirm pairing | The Learn tab loads, with your sessions listed | |
| 2.4 | Share, then Add to Home Screen | The icon is not blank or blurry, and the name reads correctly | |
| 2.5 | Open from the home screen | Full screen with no Safari bars, and the status bar does not overlap the content | |
| 2.6 | Desktop: Settings, then Phone | The phone is listed as a device | |

## 3. The core loop (the stranger test)

Hand the phone to someone who has not seen the app. Say only: "Continue the planets session and answer the question." Do not help.

| # | Step | Expected | Pass/fail |
| --- | --- | --- | --- |
| 3.1 | Find the session | The waiting session shows "Your turn" | |
| 3.2 | Open it | The transcript shows the last message, and the Answer bar is at the bottom | |
| 3.3 | Tap Answer | The sheet slides up fully, and Submit is visible without dragging | |
| 3.4 | Pick an option, set confidence, type a thought | Every tap lands first time; no 300 ms delay; the page does not zoom | |
| 3.5 | Submit | The sheet closes, the answer shows in the transcript, and the next turn streams in | |
| 3.6 | Nothing lost or duplicated | Desktop and phone show exactly one copy of the answer | |

Note anywhere the stranger hesitated for more than 5 s, and what they tried.

## 4. Reply by dictation (open questions)

| # | Step | Expected | Pass/fail |
| --- | --- | --- | --- |
| 4.1 | Open the session that ends on an open question | A Reply box shows, not "continue on desktop" | |
| 4.2 | Tap the box | The keyboard opens, the page does not zoom, and the box stays above the keyboard | |
| 4.3 | Tap the keyboard mic and dictate two sentences | Text appears with punctuation, and the box grows | |
| 4.4 | Tap Send | The box clears at once, and the reply shows in the transcript | |
| 4.5 | Airplane mode on, dictate, Send | "Not sent. Your reply is still here." shows, and the text stays in the box | |
| 4.6 | Airplane mode off, Send again | The reply is sent once, with no duplicate in the transcript | |

## 5. Drafts across devices

| # | Step | Expected | Pass/fail |
| --- | --- | --- | --- |
| 5.1 | Desktop: start answering a quiz (option plus a thought), do not submit | | |
| 5.2 | Phone: open the same session, then tap Answer | "Draft from Desktop", with the same option and thought | |
| 5.3 | Phone: change the thought, then lock the phone | | |
| 5.4 | Desktop: reload the session | The dock shows the phone's newer thought | |
| 5.5 | Desktop: submit | The phone shows "Answered on Desktop" and the sheet closes | |

## 6. Resume timing (gate 2, by stopwatch)

`npm run e2e:perf` measures this in Chromium (`docs/GATES.md`). This step confirms it on the real device over cellular. Time from the action to the moment the content is readable, 3 tries each. The budget is 3 s.

| Resume | Action | Done when | Try 1 | Try 2 | Try 3 |
| --- | --- | --- | --- | --- | --- |
| Cold | Swipe the app away in the app switcher, then tap the home-screen icon (the time to tap the row is not counted) | Learn shows the session; after the tap, the session shows the Answer bar | | | |
| Warm | Leave the app on a waiting question for 2 minutes, answer it on the desktop, then switch back to the app | The Answer bar is gone and your answer shows | | | |

## 7. Comfort and safety

| # | Check | Expected | Pass/fail |
| --- | --- | --- | --- |
| 7.1 | Rotate during an answer | Your typing survives, and the sheet stays usable | |
| 7.2 | iPhone SE or the smallest phone available | No horizontal scroll, and Submit is reachable | |
| 7.3 | Settings: Accessibility, then Motion, then Reduce Motion on | Sheets appear without sliding, and nothing is missing | |
| 7.4 | Largest Dynamic Type | Text grows without overlapping controls | |
| 7.5 | VoiceOver: open a session and answer | Every control is announced with a sensible name | |
| 7.6 | Desktop: revoke the phone | The phone loses access on its next request and shows the pair page | |
| 7.7 | Open the host URL from a phone that was never paired | Only the pair page loads; no session data appears | |

## Report back

- The filled tables, with the iOS version and phone model.
- The stopwatch times for step 6.
- `e2e/fixtures/tailscale-headers.json`, redacted.
- Any step a stranger could not finish unaided.
