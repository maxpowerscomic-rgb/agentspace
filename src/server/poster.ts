// Delivery layer. A thread is delivered one of two ways, chosen by its mode:
//
//   'native'  — post to the connected platform account via native.ts (real
//               APIs, threaded where supported). Requires a connection.
//   'author'  — author-only: no posting. If WIWO_POST_WEBHOOK is set, hand the
//               formatted copy to that webhook (Zapier/Make/your own poster);
//               otherwise just mark it ready for manual paste.
//
// The toggle is what lets a user choose between "wiwo posts for me" and "wiwo
// just writes it and I post it myself".
import { formatThread } from './compile.js';
import { postToPlatform } from './native.js';
import { refreshIfNeeded } from './oauth.js';
import * as store from './store.js';
import type { SavedThread, PostResult } from '../types.js';

export async function postThread(saved: SavedThread): Promise<PostResult> {
  const platform = saved.thread.platform;
  const formatted = formatThread(saved.thread, platform);
  const mode = saved.mode ?? 'author';

  if (mode === 'native') {
    let conn = store.getConnection(platform);
    if (!conn) {
      return { ok: false, platform, via: 'native', detail: `No ${platform} account connected — connect one or switch to Author only.` };
    }
    // Refresh an expiring OAuth token before posting, then persist it.
    const refreshed = await refreshIfNeeded(conn);
    if (refreshed !== conn) { store.upsertConnection(refreshed); conn = refreshed; }
    // Attach the day's before/after screenshots (first post only, poster caps count).
    const images = store
      .getChanges()
      .filter((c) => c.timestamp.slice(0, 10) === saved.thread.date)
      .flatMap((c) => [c.beforeImg, c.afterImg].filter(Boolean) as string[]);
    return postToPlatform(platform, formatted.blocks, conn, images);
  }

  // Author-only mode.
  const webhook = process.env.WIWO_POST_WEBHOOK;
  if (webhook) {
    try {
      const res = await fetch(webhook, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ platform, date: saved.thread.date, blocks: formatted.blocks, combined: formatted.combined }),
      });
      return { ok: res.ok, platform, via: 'webhook', detail: res.ok ? `Delivered to webhook (${res.status})` : `Webhook returned ${res.status}` };
    } catch (e: any) {
      return { ok: false, platform, via: 'webhook', detail: `Webhook error: ${e.message}` };
    }
  }
  return { ok: true, platform, via: 'manual', detail: 'Marked posted — copy ready to paste.' };
}
