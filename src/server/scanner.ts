// Shared scan logic: read git + transcript for a project and produce today's
// changes. Used by both the REST route and the auto-scan watcher (Phase 2).
import { randomUUID } from 'crypto';
import * as store from './store.js';
import { commitsSince } from './git.js';
import { readTranscript } from './transcript.js';
import { summarizeCommit } from './summarize.js';
import type { Project, Change } from '../types.js';

function todayISO(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/**
 * Scan a project: refresh its latest context from the transcript, read today's
 * commits, summarize the new ones, and persist. Returns the changes added.
 * The transcript read is the "after-the-fact" enrichment — it runs only once a
 * commit has already landed, never interrupting an in-flight build.
 */
export async function scanProject(project: Project): Promise<{ project: Project; added: Change[] }> {
  const t = readTranscript(project.repoPath, project.sessionPath);
  project.latestContext = t.lastAssistantParagraph || t.lastUserPrompt || project.latestContext;
  project.lastActive = t.lastActivity ?? project.lastActive;

  const commits = await commitsSince(project.repoPath, todayISO());
  const existing = store.getChanges();
  const newChanges: Change[] = [];

  for (const c of commits) {
    if (existing.some((x) => x.projectId === project.id && x.commitHash === c.hash)) continue;
    const summary = await summarizeCommit(c, project.name, t.lastAssistantParagraph);
    newChanges.push({
      id: randomUUID(),
      projectId: project.id,
      timestamp: c.timestamp,
      summary,
      filesTouched: c.files,
      commitHash: c.hash,
      diff: { added: c.added, removed: c.removed, sample: c.sample },
      buildStatus: project.buildStatus,
    });
  }

  const added = store.addChanges(newChanges);
  store.upsertProject(project);
  return { project, added };
}
