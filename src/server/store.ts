// Tiny JSON-file data store. Phase 1 keeps everything in data/wiwo.json;
// swapping to SQLite later only touches this file.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { encrypt, decrypt } from './crypto.js';
import type { WiwoData, Project, Change, SavedThread, SavedConnection, Platform, Task, Session, PushSub } from '../types.js';

const SECRET_FIELDS: (keyof SavedConnection)[] = ['token', 'appPassword', 'refreshToken'];

function encConn(c: SavedConnection): SavedConnection {
  const out = { ...c };
  for (const f of SECRET_FIELDS) if (out[f]) (out as any)[f] = encrypt(out[f] as string);
  return out;
}
function decConn(c: SavedConnection): SavedConnection {
  const out = { ...c };
  for (const f of SECRET_FIELDS) if (out[f]) (out as any)[f] = decrypt(out[f] as string);
  return out;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Overridable for tests / alternate data locations.
const DATA_DIR = process.env.WIWO_DATA_DIR
  ? path.resolve(process.env.WIWO_DATA_DIR)
  : path.resolve(__dirname, '../../data');
const DATA_FILE = process.env.WIWO_DATA_FILE
  ? path.resolve(process.env.WIWO_DATA_FILE)
  : path.join(DATA_DIR, 'wiwo.json');

function ensure() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ projects: [], changes: [] }, null, 2));
  }
}

export function read(): WiwoData {
  ensure();
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { projects: [], changes: [] };
  }
}

export function write(data: WiwoData): void {
  ensure();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

export function getProjects(): Project[] {
  return read().projects;
}

export function getProject(id: string): Project | undefined {
  return read().projects.find((p) => p.id === id);
}

export function upsertProject(project: Project): Project {
  const data = read();
  const i = data.projects.findIndex((p) => p.id === project.id);
  if (i >= 0) data.projects[i] = project;
  else data.projects.push(project);
  write(data);
  return project;
}

export function deleteProject(id: string): void {
  const data = read();
  data.projects = data.projects.filter((p) => p.id !== id);
  data.changes = data.changes.filter((c) => c.projectId !== id);
  write(data);
}

export function getChanges(): Change[] {
  return read().changes;
}

export function getChange(id: string): Change | undefined {
  return read().changes.find((c) => c.id === id);
}

/** Insert changes, skipping any whose commitHash already exists for the project. */
export function addChanges(incoming: Change[]): Change[] {
  const data = read();
  const added: Change[] = [];
  for (const c of incoming) {
    const dup =
      c.commitHash &&
      data.changes.some((x) => x.projectId === c.projectId && x.commitHash === c.commitHash);
    if (dup) continue;
    data.changes.push(c);
    added.push(c);
  }
  write(data);
  return added;
}

export function updateChange(id: string, patch: Partial<Change>): Change | undefined {
  const data = read();
  const i = data.changes.findIndex((c) => c.id === id);
  if (i < 0) return undefined;
  data.changes[i] = { ...data.changes[i], ...patch };
  write(data);
  return data.changes[i];
}

// ---- Saved threads (Phase 2/3) ----
export function getThreads(): SavedThread[] {
  return read().threads ?? [];
}

export function upsertThread(thread: SavedThread): SavedThread {
  const data = read();
  if (!data.threads) data.threads = [];
  const i = data.threads.findIndex((t) => t.id === thread.id);
  if (i >= 0) data.threads[i] = thread;
  else data.threads.push(thread);
  write(data);
  return thread;
}

export function getThread(id: string): SavedThread | undefined {
  return (read().threads ?? []).find((t) => t.id === id);
}

export function deleteThread(id: string): void {
  const data = read();
  data.threads = (data.threads ?? []).filter((t) => t.id !== id);
  write(data);
}

// ---- Platform connections (native posting, multi-account, encrypted) ----
export function getConnections(): SavedConnection[] {
  return (read().connections ?? []).map(decConn);
}

export function getConnectionById(id: string): SavedConnection | undefined {
  const c = (read().connections ?? []).find((x) => x.id === id);
  return c ? decConn(c) : undefined;
}

/** The default (or first) connection for a platform. */
export function getConnection(platform: Platform): SavedConnection | undefined {
  const list = (read().connections ?? []).filter((c) => c.platform === platform);
  const chosen = list.find((c) => c.isDefault) ?? list[0];
  return chosen ? decConn(chosen) : undefined;
}

export function upsertConnection(conn: SavedConnection): SavedConnection {
  const data = read();
  if (!data.connections) data.connections = [];
  // First account for a platform becomes its default.
  const platformCount = data.connections.filter((c) => c.platform === conn.platform && c.id !== conn.id).length;
  if (platformCount === 0) conn.isDefault = true;
  const enc = encConn(conn);
  const i = data.connections.findIndex((c) => c.id === conn.id);
  if (i >= 0) data.connections[i] = enc;
  else data.connections.push(enc);
  write(data);
  return conn;
}

export function setDefaultConnection(id: string): void {
  const data = read();
  const target = (data.connections ?? []).find((c) => c.id === id);
  if (!target) return;
  for (const c of data.connections!) if (c.platform === target.platform) c.isDefault = c.id === id;
  write(data);
}

export function deleteConnection(id: string): void {
  const data = read();
  const removed = (data.connections ?? []).find((c) => c.id === id);
  data.connections = (data.connections ?? []).filter((c) => c.id !== id);
  // If we removed the default, promote another account of that platform.
  if (removed?.isDefault) {
    const next = data.connections.find((c) => c.platform === removed.platform);
    if (next) next.isDefault = true;
  }
  write(data);
}

// ---- v2: tasks & focus sessions ----
export function getTasks(): Task[] {
  return read().tasks ?? [];
}

export function upsertTask(task: Task): Task {
  const data = read();
  if (!data.tasks) data.tasks = [];
  const i = data.tasks.findIndex((t) => t.id === task.id);
  if (i >= 0) data.tasks[i] = task;
  else data.tasks.push(task);
  write(data);
  return task;
}

export function getSessions(): Session[] {
  return read().sessions ?? [];
}

export function getSession(id: string): Session | undefined {
  return (read().sessions ?? []).find((s) => s.id === id);
}

/** The one session that isn't ended, if any (wiwo runs a single focus at a time). */
export function getActiveSession(): Session | undefined {
  return (read().sessions ?? []).find((s) => s.status !== 'ended');
}

export function upsertSession(session: Session): Session {
  const data = read();
  if (!data.sessions) data.sessions = [];
  const i = data.sessions.findIndex((s) => s.id === session.id);
  if (i >= 0) data.sessions[i] = session;
  else data.sessions.push(session);
  write(data);
  return session;
}

export function deleteSession(id: string): void {
  const data = read();
  data.sessions = (data.sessions ?? []).filter((s) => s.id !== id);
  write(data);
}

// ---- Web Push subscriptions ----
export function getPushSubs(): PushSub[] {
  return read().pushSubs ?? [];
}

export function addPushSub(sub: PushSub): void {
  const data = read();
  if (!data.pushSubs) data.pushSubs = [];
  if (!data.pushSubs.some((s) => s.endpoint === sub.endpoint)) data.pushSubs.push(sub);
  write(data);
}

export function removePushSub(endpoint: string): void {
  const data = read();
  data.pushSubs = (data.pushSubs ?? []).filter((s) => s.endpoint !== endpoint);
  write(data);
}
