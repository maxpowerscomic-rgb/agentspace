// v2 focus-session engine: the "log and keep going" loop.
//
// A Task is a thing to work on. Starting it opens a Session — a run of Sprints
// (work intervals). A server-side timer fires at each sprint boundary, flips the
// session to "awaiting-checkin", and notifies the user (SSE + Web Push). The
// user logs the sprint (typed, or pulled from the changelog) and chooses to keep
// going or end. Ending compiles the whole session into a publishable thread.
import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import * as store from './store.js';
import { commitsSince } from './git.js';
import { generate } from './providers.js';
import { compileThread, formatThread } from './compile.js';
import type { Task, Session, Sprint, Project, Change, Thread, Platform } from '../types.js';

/** Emits { sessionId, sprintIndex, detected } on 'checkin' when a sprint is due. */
export const sessionEvents = new EventEmitter();

const timers = new Map<string, NodeJS.Timeout>();

function now(): string {
  return new Date().toISOString();
}

// ---- Tasks ----
export function createTask(input: { projectId: string; title: string; intervalMin?: number }): Task {
  const task: Task = {
    id: randomUUID(),
    projectId: input.projectId,
    title: input.title.trim(),
    intervalMin: clampInterval(input.intervalMin),
    createdAt: now(),
    status: 'active',
  };
  return store.upsertTask(task);
}

function clampInterval(min?: number): number {
  const n = Math.round(Number(min) || 30);
  return Math.max(1, Math.min(180, n));
}

// ---- Session lifecycle ----
export function startSession(input: { projectId: string; title: string; intervalMin?: number }): Session {
  // One focus at a time: end any lingering session first.
  const existing = store.getActiveSession();
  if (existing) endSession(existing.id);

  const task = createTask(input);
  const startedAt = now();
  const session: Session = {
    id: randomUUID(),
    taskId: task.id,
    projectId: task.projectId,
    title: task.title,
    intervalMin: task.intervalMin,
    startedAt,
    status: 'running',
    sprints: [openSprint(1, startedAt)],
  };
  session.checkinDueAt = dueFrom(startedAt, session.intervalMin);
  store.upsertSession(session);
  armTimer(session);
  return session;
}

function openSprint(index: number, startedAt: string): Sprint {
  return { id: randomUUID(), index, startedAt, line: '', auto: false, commits: [] };
}

function dueFrom(startedAtISO: string, intervalMin: number): string {
  return new Date(new Date(startedAtISO).getTime() + intervalMin * 60_000).toISOString();
}

function currentSprint(session: Session): Sprint {
  return session.sprints[session.sprints.length - 1];
}

/**
 * Log the current sprint and decide what's next.
 * action 'continue' opens the next sprint (re-arms the timer); 'end' finishes.
 */
export function checkin(
  sessionId: string,
  input: { line?: string; auto?: boolean; altProjectId?: string; skipped?: boolean; commits?: string[]; action: 'continue' | 'end' },
): Session | undefined {
  const session = store.getSession(sessionId);
  if (!session || session.status === 'ended') return session;

  const sprint = currentSprint(session);
  sprint.endedAt = now();
  sprint.line = (input.line || '').trim();
  sprint.auto = !!input.auto;
  sprint.skipped = !!input.skipped || (!sprint.line && !input.commits?.length);
  if (input.altProjectId) sprint.altProjectId = input.altProjectId;
  if (input.commits?.length) sprint.commits = input.commits;

  if (input.action === 'end') {
    session.status = 'ended';
    session.endedAt = now();
    session.checkinDueAt = undefined;
    disarmTimer(sessionId);
    const task = store.getTasks().find((t) => t.id === session.taskId);
    if (task) store.upsertTask({ ...task, status: 'done' });
  } else {
    const next = openSprint(sprint.index + 1, now());
    session.sprints.push(next);
    session.status = 'running';
    session.checkinDueAt = dueFrom(next.startedAt, session.intervalMin);
    armTimer(session);
  }
  return store.upsertSession(session);
}

/** End the session immediately (from the Focus screen), logging the open sprint. */
export function endSession(sessionId: string, finalLine?: string): Session | undefined {
  const session = store.getSession(sessionId);
  if (!session || session.status === 'ended') return session;
  return checkin(sessionId, { line: finalLine, action: 'end', skipped: !finalLine });
}

/** Detect commits since the current sprint started, and draft a one-line summary. */
export async function scanSprint(sessionId: string): Promise<{ line: string; commits: string[]; count: number }> {
  const session = store.getSession(sessionId);
  if (!session) return { line: '', commits: [], count: 0 };
  const sprint = currentSprint(session);
  const project = store.getProject(session.projectId);
  if (!project) return { line: '', commits: [], count: 0 };

  const commits = await commitsSince(project.repoPath, sprint.startedAt);
  if (!commits.length) return { line: '', commits: [], count: 0 };

  const subjects = commits.map((c) => `- ${c.subject}`).join('\n');
  const prompt = [
    `I just finished a ${session.intervalMin}-minute focus sprint on "${session.title}" (${project.name}).`,
    `Summarize what I got done in ONE first-person past-tense sentence (max ~20 words) — no preamble, no quotes.`,
    ``,
    `Commits this sprint:\n${subjects}`,
  ].join('\n');
  const out = await generate(prompt, 60);
  const line = (out || commits.map((c) => c.subject.replace(/^(\w+)(\([^)]*\))?!?:\s*/, '')).join('; ')).replace(/^["'`]|["'`]$/g, '').split('\n')[0].trim();
  return { line, commits: commits.map((c) => c.hash), count: commits.length };
}

// ---- Server-side timer ----
function armTimer(session: Session): void {
  disarmTimer(session.id);
  if (!session.checkinDueAt) return;
  const ms = new Date(session.checkinDueAt).getTime() - Date.now();
  const fire = () => fireCheckin(session.id);
  if (ms <= 0) { fire(); return; }
  timers.set(session.id, setTimeout(fire, Math.min(ms, 2 ** 31 - 1)));
}

function disarmTimer(sessionId: string): void {
  const t = timers.get(sessionId);
  if (t) { clearTimeout(t); timers.delete(sessionId); }
}

async function fireCheckin(sessionId: string): Promise<void> {
  const session = store.getSession(sessionId);
  if (!session || session.status === 'ended') return;
  session.status = 'awaiting-checkin';
  store.upsertSession(session);
  const sprint = currentSprint(session);

  let detected = 0;
  try { detected = (await scanSprint(sessionId)).count; } catch { /* ignore */ }

  sessionEvents.emit('checkin', { sessionId, sprintIndex: sprint.index, detected });

  // Best-effort Web Push so it fires with the tab closed.
  try {
    const { sendPush } = await import('./push.js');
    await sendPush({
      title: `Check-in · ${session.title}`,
      body: detected
        ? `${session.intervalMin} min done. ${detected} commit${detected === 1 ? '' : 's'} detected — tap to log & keep going.`
        : `${session.intervalMin} min done. Tap to log this sprint & keep going.`,
      tag: 'wiwo-checkin',
      data: { url: '/', sessionId },
    });
  } catch { /* push not configured */ }
}

/** On boot, re-arm timers for any session still running. Past-due ones fire now. */
export function restoreSessionTimers(): void {
  const active = store.getActiveSession();
  if (!active) return;
  if (active.status === 'running' && active.checkinDueAt) armTimer(active);
  else if (active.status === 'awaiting-checkin') {
    // already awaiting — just make sure clients learn about it
    const sprint = currentSprint(active);
    setTimeout(() => sessionEvents.emit('checkin', { sessionId: active.id, sprintIndex: sprint.index, detected: 0 }), 1500);
  }
}

// ---- Compile a session (or one sprint) into a publishable thread ----
function loggedSprints(session: Session): Sprint[] {
  return session.sprints.filter((s) => s.line && !s.skipped);
}

function sprintChange(session: Session, sprint: Sprint): Change {
  return {
    id: sprint.id,
    projectId: sprint.altProjectId || session.projectId,
    timestamp: sprint.endedAt || sprint.startedAt,
    summary: sprint.line,
    filesTouched: [],
    buildStatus: 'unknown',
  };
}

export function compileSession(session: Session, platform: Platform = 'x') {
  const projects = store.getProjects();
  const changes = loggedSprints(session).map((s) => sprintChange(session, s));
  const thread = compileThread(projects, changes, platform);
  // Reshape the intro around the session, not "today".
  const mins = session.endedAt
    ? Math.max(1, Math.round((new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime()) / 60000))
    : session.sprints.length * session.intervalMin;
  thread.intro = `${session.title} — ${fmtDuration(mins)}, ${loggedSprints(session).length} sprint${loggedSprints(session).length === 1 ? '' : 's'} 🧵`;
  return { thread, formatted: formatThread(thread, platform) };
}

export function compileSprint(session: Session, sprintId: string, platform: Platform = 'x') {
  const sprint = session.sprints.find((s) => s.id === sprintId);
  if (!sprint || !sprint.line) return null;
  const projects = store.getProjects();
  const thread = compileThread(projects, [sprintChange(session, sprint)], platform);
  const proj = projects.find((p) => p.id === (sprint.altProjectId || session.projectId));
  thread.intro = `${session.title}${proj ? ` · ${proj.name}` : ''}`;
  return { thread, formatted: formatThread(thread, platform) };
}

function fmtDuration(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h${m ? ` ${m}m` : ''}` : `${m}m`;
}

/** Snapshot for the client: active session + its live remaining time. */
export function sessionView(session: Session | undefined) {
  if (!session) return null;
  const remainingMs = session.checkinDueAt ? new Date(session.checkinDueAt).getTime() - Date.now() : 0;
  return {
    ...session,
    remainingSec: Math.max(0, Math.round(remainingMs / 1000)),
  };
}
