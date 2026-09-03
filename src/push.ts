// Client-side Web Push registration. Best-effort: if the browser doesn't support
// push, permission is denied, or the server has no VAPID key, this quietly no-ops
// and wiwo falls back to in-app SSE check-ins.
import { api } from './api';

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Subscribe this browser to push. Returns true if a subscription is active. */
export async function registerPush(): Promise<boolean> {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
    const { key } = await api.pushKey();
    if (!key) return false; // push not configured server-side

    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      if (Notification.permission === 'denied') return false;
      const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
      if (perm !== 'granted') return false;
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });
    }
    await api.pushSubscribe(sub.toJSON());
    return true;
  } catch {
    return false;
  }
}
