// Web Push (VAPID) for PWA notifications — the sprint check-in nudge that fires
// even with the tab closed. Uses the optional `web-push` package; if it isn't
// installed the app degrades to in-app SSE toasts (no crash).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as store from './store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KEY_FILE = path.resolve(__dirname, '../../data/.vapid.json');

interface Vapid { publicKey: string; privateKey: string; subject: string }

let cachedWebPush: any | null | undefined; // undefined=untried, null=absent
async function loadWebPush(): Promise<any | null> {
  if (cachedWebPush !== undefined) return cachedWebPush;
  try {
    cachedWebPush = (await import('web-push')).default ?? (await import('web-push'));
  } catch {
    cachedWebPush = null;
  }
  return cachedWebPush;
}

async function getVapid(): Promise<Vapid | null> {
  const subject = process.env.WIWO_VAPID_SUBJECT || 'mailto:wiwo@localhost';
  if (process.env.WIWO_VAPID_PUBLIC && process.env.WIWO_VAPID_PRIVATE) {
    return { publicKey: process.env.WIWO_VAPID_PUBLIC, privateKey: process.env.WIWO_VAPID_PRIVATE, subject };
  }
  try {
    if (fs.existsSync(KEY_FILE)) {
      const v = JSON.parse(fs.readFileSync(KEY_FILE, 'utf8'));
      if (v.publicKey && v.privateKey) return { ...v, subject };
    }
  } catch { /* regenerate below */ }
  const wp = await loadWebPush();
  if (!wp) return null;
  const keys = wp.generateVAPIDKeys();
  const v: Vapid = { publicKey: keys.publicKey, privateKey: keys.privateKey, subject };
  try {
    fs.mkdirSync(path.dirname(KEY_FILE), { recursive: true });
    fs.writeFileSync(KEY_FILE, JSON.stringify({ publicKey: v.publicKey, privateKey: v.privateKey }, null, 2), { mode: 0o600 });
  } catch { /* non-fatal */ }
  return v;
}

/** The VAPID public key the browser needs to subscribe. Null if push unavailable. */
export async function getPublicKey(): Promise<string | null> {
  const v = await getVapid();
  return v?.publicKey ?? null;
}

export interface PushPayload {
  title: string;
  body: string;
  tag?: string;
  data?: Record<string, unknown>;
}

/** Send a push to every stored subscription; prune ones that are gone. */
export async function sendPush(payload: PushPayload): Promise<{ sent: number; pruned: number }> {
  const wp = await loadWebPush();
  const vapid = await getVapid();
  if (!wp || !vapid) return { sent: 0, pruned: 0 };
  wp.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);

  const subs = store.getPushSubs();
  let sent = 0, pruned = 0;
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await wp.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify(payload));
        sent++;
      } catch (e: any) {
        if (e?.statusCode === 404 || e?.statusCode === 410) { store.removePushSub(sub.endpoint); pruned++; }
      }
    }),
  );
  return { sent, pruned };
}
