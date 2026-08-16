// Posting layer (Phase 3). Real platform APIs (X, LinkedIn, …) need per-user
// OAuth, which is a setup step wiwo can't fake. So the honest, genuinely
// working delivery mechanism is a user-configured outgoing webhook
// (WIWO_POST_WEBHOOK) — point it at Zapier/Make/n8n or your own poster, and
// wiwo POSTs the formatted thread there. Without a webhook, "posting" simply
// marks the thread posted so you can paste the copy yourself.
import { formatThread } from './compile.js';
import type { SavedThread } from '../types.js';

export interface PostResult {
  delivered: boolean;
  via: 'webhook' | 'manual';
  detail: string;
}

export async function postThread(saved: SavedThread): Promise<PostResult> {
  const formatted = formatThread(saved.thread, saved.thread.platform);
  const webhook = process.env.WIWO_POST_WEBHOOK;

  if (webhook) {
    try {
      const res = await fetch(webhook, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          platform: saved.thread.platform,
          date: saved.thread.date,
          blocks: formatted.blocks,
          combined: formatted.combined,
        }),
      });
      return {
        delivered: res.ok,
        via: 'webhook',
        detail: res.ok ? `Delivered to webhook (${res.status})` : `Webhook returned ${res.status}`,
      };
    } catch (e: any) {
      return { delivered: false, via: 'webhook', detail: `Webhook error: ${e.message}` };
    }
  }

  // No webhook configured — copy is ready for manual posting.
  return { delivered: true, via: 'manual', detail: 'Marked posted — copy ready to paste.' };
}
