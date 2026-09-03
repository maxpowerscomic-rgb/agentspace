// Auto-scan file watcher (Phase 2). Watches each project's .git/logs/HEAD —
// which git appends to on every commit — and triggers a scan when it changes.
//
// This is the "effortless" core: the log fills in as a byproduct of committing,
// with no button press. Watching the *commit* signal (not the working tree)
// keeps wiwo out of the way during a build — it only reacts once work has
// landed, honoring the "never interrupt mid-build" rule.
import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import * as store from './store.js';
import { scanProject } from './scanner.js';

const DEBOUNCE_MS = 1500;

export const watchEvents = new EventEmitter();

interface Watch {
  watcher: fs.FSWatcher;
  timer?: NodeJS.Timeout;
}
const watches = new Map<string, Watch>();

function headLogPath(repoPath: string): string {
  return path.join(repoPath, '.git', 'logs', 'HEAD');
}

/** Begin watching a project for new commits. Idempotent. */
export function watchProject(projectId: string): void {
  const project = store.getProject(projectId);
  if (!project) return;
  if (watches.has(projectId)) return;
  const target = headLogPath(project.repoPath);
  if (!fs.existsSync(target)) return;

  const watcher = fs.watch(target, () => {
    const w = watches.get(projectId);
    if (!w) return;
    if (w.timer) clearTimeout(w.timer);
    // Debounce: a commit can touch the log a few times in quick succession.
    w.timer = setTimeout(async () => {
      const p = store.getProject(projectId);
      if (!p || !p.autoScan) return;
      try {
        const { added } = await scanProject(p);
        if (added.length) watchEvents.emit('scanned', { projectId, added });
      } catch {
        /* ignore — a transient git state; next commit re-triggers */
      }
    }, DEBOUNCE_MS);
  });

  watches.set(projectId, { watcher });
}

export function unwatchProject(projectId: string): void {
  const w = watches.get(projectId);
  if (!w) return;
  if (w.timer) clearTimeout(w.timer);
  w.watcher.close();
  watches.delete(projectId);
}

/** Start watchers for every project that has autoScan enabled. */
export function initWatchers(): void {
  for (const p of store.getProjects()) {
    if (p.autoScan) watchProject(p.id);
  }
}
