# wiwo on your iPhone

**wiwo is a companion, not a standalone iOS app — by necessity.** Its core job is
watching *your dev machine's* git repos, running git/Playwright, and driving
Claude Code. None of that can happen on a sandboxed iPhone (your code isn't even
on the phone). So the phone runs the **review + share half** of wiwo — glance at
project status, read the daily log, edit the compiled thread, and **post to
socials from anywhere** — while the server keeps doing the heavy lifting on your
desktop.

wiwo ships as an installable **PWA**: add it to your Home Screen and it opens
full-screen with its own icon, like a native app.

## Option A — same Wi-Fi (30 seconds, no accounts)

1. On your Mac/PC, run wiwo: `npm run dev` (it listens on `0.0.0.0:3000`).
2. Find your machine's LAN IP (macOS: System Settings → Wi-Fi → Details, e.g.
   `192.168.1.42`).
3. On your iPhone (same Wi-Fi), open Safari → `http://192.168.1.42:3000`.
4. Share button → **Add to Home Screen**. Done — tap the wiwo icon anytime.

The app talks to your desktop over the same origin, so everything works. (Note:
over plain `http` the service worker won't register — that's fine; the app still
runs. You just don't get offline caching. Use Option B for the full PWA.)

## Option B — from anywhere + full PWA (secure tunnel)

To reach your Mac off your home network *and* enable the service worker (which
needs `https`), expose the server through a tunnel that provides TLS:

- **Tailscale** (recommended, private): `tailscale serve https / http://localhost:3000`
  → open your device's `https://<name>.ts.net` URL on the phone.
- **Cloudflare Tunnel**: `cloudflared tunnel --url http://localhost:3000`.
- **ngrok**: `ngrok http 3000`.

Open the `https://…` URL in Safari → **Add to Home Screen**. Now the service
worker registers, and you can post from the couch or the coffee shop.

> Keep the tunnel private (Tailscale) or protected — the wiwo server has access
> to your repos and stored tokens.

## A real native App Store app?

Possible, but it would still be a **thin client to your desktop server** (the
phone can't host the wiwo backend). The fastest path is to wrap this same web app
with **Capacitor** (`@capacitor/ios`) — it produces an Xcode project that loads
the wiwo UI in a native shell, which you build and submit from a Mac with Xcode.
That buys you an App Store listing and native niceties (share sheet, push), but
not new capability over the PWA. Ask and wiwo can scaffold the Capacitor config.
