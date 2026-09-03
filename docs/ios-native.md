# Building the native iOS app (Xcode)

wiwo ships a **Capacitor** wrapper so you can build a real iOS app and run it on
your iPhone (or submit to the App Store). The native app is a **thin client**: it
displays the wiwo UI and talks to *your* wiwo server running on your Mac — the
phone can't host the backend (it can't watch your repos), so the Mac stays the
engine.

## Prerequisites (all on a Mac)

- macOS with **Xcode** installed (from the App Store).
- **CocoaPods**: `sudo gem install cocoapods` (or `brew install cocoapods`).
- Node.js + this repo cloned, `npm install` run.
- An Apple ID for signing (free account is enough to run on your own device).

## One-time setup

```sh
# 1. Point the app at your running wiwo server. Use a private HTTPS tunnel so it
#    works from anywhere (recommended); a LAN IP works on the same Wi-Fi.
#    e.g. Tailscale:  tailscale serve https / http://localhost:3000
export WIWO_SERVER_URL="https://your-mac.ts.net"     # or http://192.168.1.42:3000

# 2. Build the web app and generate the native iOS project:
npm run ios:add      # = npm run build && npx cap add ios   (creates ./ios)

# 3. Open it in Xcode:
npm run ios:open
```

In Xcode: pick your iPhone (or a simulator), set your Team under
**Signing & Capabilities**, and press **▶ Run**. The wiwo icon appears on your
phone.

> `capacitor.config.ts` reads `WIWO_SERVER_URL` at build time. Change servers →
> re-export it and run `npm run ios:sync`, then rebuild in Xcode.

## After you change the web app

```sh
npm run ios:sync     # rebuild web + copy into the iOS project
# then re-run in Xcode
```

## App Store submission (optional)

- Set a unique bundle id (`appId` in `capacitor.config.ts`, already
  `com.maxpowerscomic.wiwo`), a version, and app icons (Xcode → Assets).
- Archive in Xcode (**Product → Archive**) and upload via the Organizer.
- Note for review: the app **requires your own wiwo server** to be running and
  reachable, and (for AI) your own key or Claude subscription. Make that clear in
  the App Store description and your review notes, or reviewers will see an app
  that "does nothing" without a server. A demo/read-only server URL for review
  helps.

## Reality check

This gives you an App Store-able app icon and native niceties (share sheet, push
later), but **not new capability** over the installed PWA — both are windows onto
your desktop server. If you don't need an App Store listing, the PWA
(`docs/ios.md`) is zero-setup.
