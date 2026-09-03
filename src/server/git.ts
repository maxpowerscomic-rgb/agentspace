// Reads git history from a project's repo. wiwo is a passive observer:
// it only ever *reads* the repo, never writes to it.
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const exec = promisify(execFile);

export interface GitCommit {
  hash: string;
  subject: string;
  body: string;
  timestamp: string; // ISO
  files: string[];
  added: number;
  removed: number;
  sample: string; // short diff excerpt for the "after" card
}

export function isRepo(repoPath: string): boolean {
  try {
    return fs.existsSync(path.join(repoPath, '.git'));
  } catch {
    return false;
  }
}

async function git(repoPath: string, args: string[]): Promise<string> {
  const { stdout } = await exec('git', ['-C', repoPath, ...args], {
    maxBuffer: 1024 * 1024 * 16,
  });
  return stdout;
}

/** Commits authored since the given ISO date (defaults to start of today, local). */
export async function commitsSince(repoPath: string, sinceISO?: string): Promise<GitCommit[]> {
  if (!isRepo(repoPath)) throw new Error(`Not a git repo: ${repoPath}`);
  const since = sinceISO ?? startOfToday();

  // Delimiter-separated log so we can parse robustly.
  const SEP = '\x1e';
  const REC = '\x1f';
  const fmt = ['%H', '%s', '%b', '%cI'].join(SEP);
  const raw = await git(repoPath, [
    'log',
    `--since=${since}`,
    `--pretty=format:${fmt}${REC}`,
    '--no-color',
  ]);

  const records = raw.split(REC).map((r) => r.trim()).filter(Boolean);
  const commits: GitCommit[] = [];

  for (const rec of records) {
    const [hash, subject, body, cISO] = rec.split(SEP);
    if (!hash) continue;
    const { files, added, removed } = await statFor(repoPath, hash);
    const sample = await sampleDiff(repoPath, hash);
    commits.push({
      hash,
      subject: subject ?? '',
      body: (body ?? '').trim(),
      timestamp: cISO ?? new Date().toISOString(),
      files,
      added,
      removed,
      sample,
    });
  }
  // Oldest first — the log reads top-to-bottom through the day.
  return commits.reverse();
}

/** Walk history for a retrospective. Optional since/until (ISO) + a max cap. */
export async function historyCommits(
  repoPath: string,
  opts: { since?: string; until?: string; max?: number } = {},
): Promise<GitCommit[]> {
  if (!isRepo(repoPath)) throw new Error(`Not a git repo: ${repoPath}`);
  const SEP = '\x1e';
  const REC = '\x1f';
  const fmt = ['%H', '%s', '%b', '%cI'].join(SEP);
  const args = ['log', `--pretty=format:${fmt}${REC}`, '--no-color'];
  if (opts.since) args.push(`--since=${opts.since}`);
  if (opts.until) args.push(`--until=${opts.until}`);
  if (opts.max) args.push(`-n`, String(opts.max));

  const raw = await git(repoPath, args);
  const records = raw.split(REC).map((r) => r.trim()).filter(Boolean);
  const commits: GitCommit[] = [];
  for (const rec of records) {
    const [hash, subject, body, cISO] = rec.split(SEP);
    if (!hash) continue;
    const { files, added, removed } = await statFor(repoPath, hash);
    commits.push({
      hash,
      subject: subject ?? '',
      body: (body ?? '').trim(),
      timestamp: cISO ?? new Date().toISOString(),
      files,
      added,
      removed,
      sample: '', // omit per-commit diff sample for retros — too heavy over full history
    });
  }
  return commits.reverse(); // oldest first
}

async function statFor(repoPath: string, hash: string) {
  const out = await git(repoPath, ['show', '--numstat', '--format=', '--no-color', hash]);
  const files: string[] = [];
  let added = 0;
  let removed = 0;
  for (const line of out.split('\n')) {
    const m = line.trim().match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
    if (!m) continue;
    added += m[1] === '-' ? 0 : parseInt(m[1], 10);
    removed += m[2] === '-' ? 0 : parseInt(m[2], 10);
    files.push(m[3]);
  }
  return { files, added, removed };
}

async function sampleDiff(repoPath: string, hash: string): Promise<string> {
  try {
    const out = await git(repoPath, ['show', '--format=', '--no-color', '-U1', hash]);
    const lines = out
      .split('\n')
      .filter((l) => /^[+-]/.test(l) && !/^[+-]{3} /.test(l))
      .slice(0, 8);
    return lines.join('\n');
  } catch {
    return '';
  }
}

/** Most recent commit subject — a cheap "latest context" fallback. */
export async function latestCommitSubject(repoPath: string): Promise<string | undefined> {
  if (!isRepo(repoPath)) return undefined;
  try {
    const out = await git(repoPath, ['log', '-1', '--pretty=format:%s']);
    return out.trim() || undefined;
  } catch {
    return undefined;
  }
}

export async function lastCommitTime(repoPath: string): Promise<string | undefined> {
  if (!isRepo(repoPath)) return undefined;
  try {
    const out = await git(repoPath, ['log', '-1', '--pretty=format:%cI']);
    return out.trim() || undefined;
  } catch {
    return undefined;
  }
}

function startOfToday(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
