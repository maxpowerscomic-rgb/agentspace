// Turns a commit (diff + subject + optional transcript context) into a one-line
// log entry. This is *wiwo's own* summarizer — a swappable component, not the
// project's coding agent. Model-agnostic (Phase 3) with a graceful fallback.
import type { GitCommit } from './git.js';
import { generate } from './providers.js';

/** Produce a short, human "what changed" line for a commit. */
export async function summarizeCommit(
  commit: GitCommit,
  projectName: string,
  agentContext?: string,
): Promise<string> {
  const prompt = buildPrompt(commit, projectName, agentContext);
  const out = await generate(prompt, 60);
  return (out && cleanLine(out)) || fallbackSummary(commit);
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
