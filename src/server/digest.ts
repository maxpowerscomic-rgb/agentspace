// Streaks + weekly digest (Phase 3). Pure functions over the change log.
import type { Change, Project } from '../types.js';

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}
function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}
function shiftDay(key: string, delta: number): string {
  const d = new Date(key + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Current run of consecutive days (ending today or yesterday) with ≥1 change. */
export function computeStreak(changes: Change[]): number {
  const days = new Set(changes.map((c) => dayKey(c.timestamp)));
  if (days.size === 0) return 0;
  let cursor = todayKey();
  // Allow the streak to still count if nothing yet today but yesterday was active.
  if (!days.has(cursor)) cursor = shiftDay(cursor, -1);
  let streak = 0;
  while (days.has(cursor)) {
    streak++;
    cursor = shiftDay(cursor, -1);
  }
  return streak;
}

export interface WeeklyDigest {
  from: string;
  to: string;
  totalChanges: number;
  activeDays: number;
  streak: number;
  byProject: { projectId: string; name: string; count: number; summaries: string[] }[];
  headline: string;
}

/** Roll up the last 7 days (inclusive of today). */
export function weeklyDigest(projects: Project[], changes: Change[]): WeeklyDigest {
  const to = todayKey();
  const from = shiftDay(to, -6);
  const inWindow = changes.filter((c) => {
    const k = dayKey(c.timestamp);
    return k >= from && k <= to;
  });

  const byProjectMap = new Map<string, Change[]>();
  for (const c of inWindow) {
    if (!byProjectMap.has(c.projectId)) byProjectMap.set(c.projectId, []);
    byProjectMap.get(c.projectId)!.push(c);
  }
  const byProject = [...byProjectMap.entries()]
    .map(([projectId, list]) => ({
      projectId,
      name: projects.find((p) => p.id === projectId)?.name ?? projectId,
      count: list.length,
      summaries: list.map((c) => c.summary).slice(0, 6),
    }))
    .sort((a, b) => b.count - a.count);

  const activeDays = new Set(inWindow.map((c) => dayKey(c.timestamp))).size;
  const streak = computeStreak(changes);
  const headline =
    inWindow.length === 0
      ? 'Quiet week — no changes logged.'
      : `${inWindow.length} change${inWindow.length === 1 ? '' : 's'} across ${byProject.length} project${byProject.length === 1 ? '' : 's'} in ${activeDays} active day${activeDays === 1 ? '' : 's'}.`;

  return { from, to, totalChanges: inWindow.length, activeDays, streak, byProject, headline };
}
