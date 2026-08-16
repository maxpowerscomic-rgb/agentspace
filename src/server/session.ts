// Live Claude Code session control (Phase 4). This is the deepest integration:
// wiwo drives a project's actual Claude Code session via the Claude Agent SDK,
// so a prompt typed on the dashboard runs in that repo and continues the same
// conversation across turns.
//
// The SDK is an OPTIONAL dependency, lazy-imported so the server boots without
// it. If it (or ANTHROPIC_API_KEY) is missing, callers fall back to Phase 1's
// "record the prompt" behavior — wiwo still works, just without live control.
import * as store from './store.js';
import type { Project } from '../types.js';
import type { GitCommit } from './git.js';

// Non-interactive by default. Override with WIWO_PERMISSION_MODE; only set
// "bypassPermissions" if you also understand it skips every approval prompt.
const PERMISSION_MODE = (process.env.WIWO_PERMISSION_MODE || 'acceptEdits') as
  | 'acceptEdits'
  | 'dontAsk'
  | 'bypassPermissions';

function claudeModel(): string | undefined {
  const m = process.env.WIWO_MODEL;
  return m && m.startsWith('claude-') ? m : undefined;
}

export interface SessionReply {
  available: boolean;
  text: string;
  sessionId?: string;
  note?: string;
}

async function loadSdk(): Promise<any | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    // Optional dependency — resolved at runtime only. The typechecker doesn't
    // require it to be installed, so wiwo builds with or without live control.
    // @ts-ignore — module may be absent; handled by the catch below.
    return await import('@anthropic-ai/claude-agent-sdk');
  } catch {
    return null;
  }
}

/**
 * Send a prompt into the project's Claude Code session (resuming if we have a
 * session id), run to completion, and return the agent's final reply. Persists
 * the session id so the next prompt continues the same conversation.
 */
export async function sendToSession(project: Project, prompt: string): Promise<SessionReply> {
  const sdk = await loadSdk();
  if (!sdk) {
    return {
      available: false,
      text: '',
      note: 'Live session control needs @anthropic-ai/claude-agent-sdk + ANTHROPIC_API_KEY. Prompt recorded instead.',
    };
  }

  let text = '';
  let sessionId: string | undefined = project.claudeSessionId;
  try {
    for await (const message of sdk.query({
      prompt,
      options: {
        cwd: project.repoPath,
        resume: project.claudeSessionId,
        model: claudeModel(),
        permissionMode: PERMISSION_MODE,
        allowedTools: ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash'],
        maxTurns: 40,
      },
    })) {
      if (message.type === 'system' && message.subtype === 'init') {
        sessionId = message.session_id;
      }
      if (message.type === 'result') {
        if (message.subtype === 'success') text = message.result;
        sessionId = message.session_id ?? sessionId;
        break;
      }
    }
  } catch (e: any) {
    return { available: true, text: '', sessionId, note: `Agent error: ${e.message}` };
  }

  // Persist the session id so follow-ups continue the same conversation.
  if (sessionId && sessionId !== project.claudeSessionId) {
    const fresh = store.getProject(project.id);
    if (fresh) store.upsertProject({ ...fresh, claudeSessionId: sessionId });
  }
  return { available: true, text, sessionId };
}

/**
 * The "query rule": after a commit has ALREADY landed, ask the agent for a
 * sharper one-line summary. Read-only, low turn cap — this never runs during a
 * build, only after the change is settled. Returns null on any failure so the
 * mechanical summary stands.
 */
export async function enrichSummary(project: Project, commit: GitCommit): Promise<string | null> {
  const sdk = await loadSdk();
  if (!sdk || !project.claudeSessionId) return null;

  const prompt = [
    `One line, past tense, max 10 words: what did you just change in commit ${commit.hash.slice(0, 7)} and why?`,
    `No quotes, no preamble — just the line.`,
    `Commit message: ${commit.subject}`,
  ].join('\n');

  try {
    for await (const message of sdk.query({
      prompt,
      options: {
        cwd: project.repoPath,
        resume: project.claudeSessionId,
        model: claudeModel(),
        permissionMode: 'acceptEdits',
        allowedTools: ['Read', 'Glob', 'Grep'], // read-only: enrichment must never edit
        maxTurns: 2,
      },
    })) {
      if (message.type === 'result') {
        if (message.subtype === 'success' && message.result) {
          return message.result.replace(/^["'`]|["'`]$/g, '').replace(/\.$/, '').split('\n')[0].trim().slice(0, 120);
        }
        return null;
      }
    }
  } catch {
    return null;
  }
  return null;
}
