import type { CapacitorConfig } from '@capacitor/cli';

// wiwo iOS wrapper (Capacitor). The native app is a thin client: it loads the
// wiwo UI and talks to YOUR wiwo server (running on your Mac). Set `server.url`
// to your server's address — a LAN IP on the same Wi-Fi, or (better) a private
// HTTPS tunnel (Tailscale/Cloudflare/ngrok) so it works from anywhere.
//
// Leave server.url unset to instead ship the bundled web build (webDir) — but
// then you must configure a server base URL in-app, so pointing at a running
// server is the simpler path.
const SERVER_URL = process.env.WIWO_SERVER_URL; // e.g. https://your-mac.ts.net

const config: CapacitorConfig = {
  appId: 'com.maxpowerscomic.wiwo',
  appName: 'wiwo',
  webDir: 'dist',
  ios: {
    contentInset: 'always',
  },
  server: SERVER_URL
    ? { url: SERVER_URL, cleartext: SERVER_URL.startsWith('http://') }
    : undefined,
};

export default config;
