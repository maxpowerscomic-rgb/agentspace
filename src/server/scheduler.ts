// Scheduled-posting loop (Phase 3). Every minute, fire any saved thread whose
// scheduledFor has arrived. Best-effort and idempotent — a fired thread flips
// to 'posted' so it never fires twice.
import * as store from './store.js';
import { postThread } from './poster.js';

const TICK_MS = 60_000;
let timer: NodeJS.Timeout | undefined;

async function tick(): Promise<void> {
  const now = Date.now();
  for (const saved of store.getThreads()) {
    if (saved.status !== 'scheduled' || !saved.scheduledFor) continue;
    if (new Date(saved.scheduledFor).getTime() > now) continue;
    try {
      const result = await postThread(saved);
      store.upsertThread({
        ...saved,
        status: result.delivered ? 'posted' : 'scheduled',
        postedAt: result.delivered ? new Date().toISOString() : undefined,
        updatedAt: new Date().toISOString(),
      });
    } catch {
      /* leave scheduled; retry next tick */
    }
  }
}

export function startScheduler(): void {
  if (timer) return;
  timer = setInterval(() => void tick(), TICK_MS);
  // `unref` so the loop never keeps the process alive on its own.
  timer.unref?.();
}
