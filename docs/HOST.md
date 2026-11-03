# Headless host

Run LMobile on an always-on Mac or VPS with no Electron. The phone reaches it over a private tunnel.

1. Build once: `npm ci && npm run build && node scripts/build-server.mjs`
2. Run (loopback only, port 3210 by default):
   ```
   LH_REMOTE_HOSTS=my-host.tailnet-1234.ts.net \
   LH_DATA_DIR=/var/lib/lmobile PORT=3210 npm run host
   ```
   `LH_REMOTE_HOSTS` is required: lowercase hostnames, optional `:port`, no IPs, schemes or `localhost`.
   The host refuses to start if `LH_DESKTOP_SERVER=1` or `LH_DESKTOP_API_SECRET` is set.
3. Expose it privately: `tailscale serve --bg https / http://127.0.0.1:3210`
   Never use `tailscale funnel`; the host must stay off the public internet.
4. Pair a phone: open the tunnel URL on the host, scan the QR from the phone's Safari, then Add to Home Screen.
   The pairing UI lands in Wave C; until then pairing is not available from the browser.
5. Revoke a device: remove it from the paired devices list (Wave C UI), which invalidates its credential at once.

Security notes
- The server binds 127.0.0.1 always; only the tunnel can reach it.
- A phone never gets the `admin` or `graph:write` scopes.
- Secrets come from the environment only. Config errors name the variable, never the value.
- Build with `NEXT_PUBLIC_LH_MOBILE_SHELL=1` to serve the phone shell.
