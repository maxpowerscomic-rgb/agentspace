// Reads Claude Code session transcripts (JSONL). Passive: read-only.
// Claude Code stores sessions under ~/.claude/projects/<encoded-repo-path>/<session>.jsonl
// where the encoded path is the absolute repo path with each "/" replaced by "-".
import fs from 'fs';
import os from 'os';
import path from 'path';

export interface TranscriptSummary {
  /** Last substantial assistant paragraph — the "last chat" context. */
  lastAssistantParagraph?: string;
  /** Most recent human prompt. */
  lastUserPrompt?: string;
  /** ISO timestamp of the newest turn. */
  lastActivity?: string;
  sessionFile?: string;
}

function encodeRepoPath(repoPath: string): string {
  return repoPath.replace(/\//g, '-');
}

/** Find the newest .jsonl transcript for a repo, or use an explicit override. */
export function findSessionFile(repoPath: string, override?: string): string | undefined {
  if (override && fs.existsSync(override)) return override;
  const base = path.join(os.homedir(), '.claude', 'projects', encodeRepoPath(repoPath));
  if (!fs.existsSync(base)) return undefined;
  const files = fs
    .readdirSync(base)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => path.join(base, f));
  if (!files.length) return undefined;
  files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return files[0];
}

function textFromContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((b: any) => b && b.type === 'text' && typeof b.text === 'string')
      .map((b: any) => b.text)
      .join('\n')
      .trim();
  }
  return '';
}

function lastParagraph(text: string): string {
  const paras = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  return paras.length ? paras[paras.length - 1] : text.trim();
}

export function readTranscript(repoPath: string, override?: string): TranscriptSummary {
  const sessionFile = findSessionFile(repoPath, override);
  if (!sessionFile) return {};

  let lastAssistantParagraph: string | undefined;
  let lastUserPrompt: string | undefined;
  let lastActivity: string | undefined;

  try {
    const lines = fs.readFileSync(sessionFile, 'utf8').split('\n').filter(Boolean);
    for (const line of lines) {
      let obj: any;
      try {
        obj = JSON.parse(line);
      } catch {
        continue;
      }
      const role = obj?.message?.role ?? obj?.role ?? obj?.type;
      const content = obj?.message?.content ?? obj?.content;
      const ts = obj?.timestamp;
      if (ts) lastActivity = ts;

      const text = textFromContent(content);
      if (!text) continue;
      if (role === 'assistant') lastAssistantParagraph = lastParagraph(text);
      else if (role === 'user') lastUserPrompt = text.split('\n')[0].slice(0, 240);
    }
  } catch {
    return { sessionFile };
  }

  return { lastAssistantParagraph, lastUserPrompt, lastActivity, sessionFile };
}
