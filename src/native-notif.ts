// Native local notifications for the iOS/Android Capacitor app. On a real phone
// the WKWebView can't rely on Web Push, so we schedule a local notification at
// the sprint's check-in time instead. No-ops on the web (isNativePlatform=false).
const CHECKIN_ID = 4201;

function inCapacitor(): boolean {
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return !!cap?.isNativePlatform?.();
}

/** Schedule the check-in nudge at `atISO`. Cancels any previous one first. */
export async function scheduleCheckinNotif(atISO: string, title: string, body: string): Promise<void> {
  if (!inCapacitor()) return;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const perm = await LocalNotifications.requestPermissions();
    if (perm.display !== 'granted') return;
    await LocalNotifications.cancel({ notifications: [{ id: CHECKIN_ID }] });
    const at = new Date(atISO);
    if (at.getTime() <= Date.now()) return;
    await LocalNotifications.schedule({
      notifications: [{ id: CHECKIN_ID, title, body, schedule: { at } }],
    });
  } catch { /* plugin unavailable — fall back to Web Push / in-app SSE */ }
}

export async function cancelCheckinNotif(): Promise<void> {
  if (!inCapacitor()) return;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await LocalNotifications.cancel({ notifications: [{ id: CHECKIN_ID }] });
  } catch { /* ignore */ }
}
