// Retrospective threads: walk a project's git history, bucket commits into time
// windows (day / week / month), summarize each window, and build a Thread where
// each post is one window — a "here's how it came together" story.
import { generate } from './providers.js';
import type { GitCommit } from './git.js';
import type { Thread, ThreadPost } from '../types.js';

export type Window = 'day' | 'week' | 'month';

interface Bucket {
  key: string;   // sortable, e.g. 2026-W32
  label: string; // human, e.g. "Week of Aug 4"
  commits: GitCommit[];
}

function startOfWeek(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (x.getUTCDay() + 6) % 7; // Mon=0
  x.setUTCDate(x.getUTCDate() - day);
  return x;
}
function isoWeek(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - day + 3); // Thursday of this week
  const firstThu = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((t.getTime() - firstThu.getTime()) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function bucketOf(iso: string, window: Window): { key: string; label: string } {
  const d = new Date(iso);
  if (window === 'day') {
    const key = iso.slice(0, 10);
    return { key, label: `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}` };
  }
  if (window === 'month') {
    return { key: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`, label: `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}` };
  }
  const s = startOfWeek(d);
  return { key: isoWeek(d), label: `Week of ${MONTHS[s.getUTCMonth()]} ${s.getUTCDate()}` };
}

function bucketCommits(commits: GitCommit[], window: Window): Bucket[] {
  const map = new Map<string, Bucket>();
  for (const c of commits) {
    const { key, label } = bucketOf(c.timestamp, window);
    if (!map.has(key)) map.set(key, { key, label, commits: [] });
    map.get(key)!.commits.push(c);
  }
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}

function cleanLine(s: string): string {
  return s.replace(/^["'`]|["'`]$/g, '').replace(/\.$/, '').split('\n')[0].trim();
}
function stripPrefix(subject: string): string {
  return subject.replace(/^(\w+)(\([^)]*\))?!?:\s*/, '');
}

/** Summarize one window's commits into a short headline (LLM, with fallback). */
async function summarizeBucket(bucket: Bucket, projectName: string): Promise<string> {
  const subjects = bucket.commits.map((c) => `- ${c.subject}`).slice(0, 40).join('\n');
  const prompt = [
    `Summarize this window of a dev project for a "building in public" thread.`,
    `Write ONE past-tense sentence (max ~18 words) capturing the theme of the work — no preamble, no quotes.`,
    ``,
    `Project: ${projectName}`,
    `Window: ${bucket.label}`,
    `Commits:\n${subjects}`,
  ].join('\n');
  const out = await generate(prompt, 60);
  if (out) return cleanLine(out);
  // Fallback: the single largest commit's cleaned subject.
  const biggest = [...bucket.commits].sort((a, b) => b.added + b.removed - (a.added + a.removed))[0];
  return biggest ? cleanLine(stripPrefix(biggest.subject)) : 'Assorted changes';
}

export interface RetroResult {
  thread: Thread;
  windowCount: number;
  commitCount: number;
}

/** Build a retrospective thread grouped by time window. */
export async function buildRetro(
  projectName: string,
  commits: GitCommit[],
  window: Window,
  platform: Thread['platform'] = 'x',
): Promise<RetroResult> {
  const buckets = bucketCommits(commits, window);

  const posts: ThreadPost[] = [];
  for (const b of buckets) {
    const headline = await summarizeBucket(b, projectName);
    // A few notable changes as bullets (largest by churn).
    const bullets = [...b.commits]
      .sort((x, y) => y.added + y.removed - (x.added + x.removed))
      .slice(0, 3)
      .map((c) => `• ${cleanLine(stripPrefix(c.subject))}`)
      .join('\n');
    posts.push({
      text: `${b.label} — ${headline}\n${bullets}`,
      images: [],
      alt: [],
    });
  }

  const span = window === 'day' ? 'day by day' : window === 'month' ? 'month by month' : 'week by week';
  const intro = `How ${projectName} came together, ${span} 🧵 (${commits.length} commits over ${buckets.length} ${window}${buckets.length === 1 ? '' : 's'}) ↓`;

  return {
    thread: {
      date: new Date().toISOString().slice(0, 10),
      intro,
      posts,
      hashtags: '#buildinpublic #devlog #indiehackers',
      platform,
    },
    windowCount: buckets.length,
    commitCount: commits.length,
  };
}
