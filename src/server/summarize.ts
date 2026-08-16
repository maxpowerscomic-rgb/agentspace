// Turns a commit (diff + subject + optional transcript context) into a one-line
// log entry. This is *wiwo's own* summarizer — a swappable component, not the
// project's coding agent. Defaults to Claude; falls back gracefully with no key.
import type { GitCommit } from './git.js';

const MODEL = process.env.WIWO_MODEL || 'claude-opus-5';
const ENDPOINT = 'https://api.anthropic.com/v1/messages';

/** Produce a short, human "what changed" line for a commit. */
export async function summarizeCommit(
  commit: GitCommit,
  projectName: string,
  agentContext?: string,
): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  // No key configured → honest heuristic fallback. wiwo still works, just less polished.
  if (!key) return fallbackSummary(commit);

  const prompt = buildPrompt(commit, projectName, agentContext);
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 60,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) return fallbackSummary(commit);
    const data: any = await res.json();
    const text = (data?.content ?? [])
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('')
      .trim();
    return cleanLine(text) || fallbackSummary(commit);
  } catch {
    return fallbackSummary(commit);
  }
}

function buildPrompt(commit: GitCommit, projectName: string, agentContext?: string): string {
  const files = commit.files.slice(0, 12).join(', ');
  return [
    `Write a single, past-tense log line (max 10 words) describing what changed in this commit for a "building in public" dev log.`,
    `No quotes, no trailing period, no preamble — just the line.`,
    ``,
    `Project: ${projectName}`,
    `Commit message: ${commit.subject}`,
    commit.body ? `Details: ${commit.body}` : '',
    agentContext ? `Agent context: ${agentContext}` : '',
    `Files: ${files}`,
    `Diff sample:\n${commit.sample.slice(0, 1200)}`,
  ]
    .filter(Boolean)
    .join('\n');
}

function fallbackSummary(commit: GitCommit): string {
  // Strip conventional-commit prefixes ("feat: ", "fix(scope): ") for readability.
  const s = commit.subject.replace(/^(\w+)(\([^)]*\))?!?:\s*/, '');
  return cleanLine(s) || `Updated ${commit.files[0] ?? 'files'}`;
}

function cleanLine(s: string): string {
  return s.replace(/^["'`]|["'`]$/g, '').replace(/\.$/, '').split('\n')[0].trim().slice(0, 120);
}
