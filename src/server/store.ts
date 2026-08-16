// Tiny JSON-file data store. Phase 1 keeps everything in data/wiwo.json;
// swapping to SQLite later only touches this file.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { WiwoData, Project, Change, SavedThread } from '../types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data');
const DATA_FILE = path.join(DATA_DIR, 'wiwo.json');

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
