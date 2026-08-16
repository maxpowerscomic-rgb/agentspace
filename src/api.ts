// Thin client for the wiwo API.
import type { Project, Change, Thread, Platform, SavedThread } from './types';

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error || `${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  listProjects: () => fetch('/api/projects').then(j<(Project & { todayCount: number })[]>),

  addProject: (body: { name: string; repoPath: string; buildCmd?: string; appUrl?: string; autoScan?: boolean }) =>
    fetch('/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).then(j<Project>),

  patchProject: (id: string, body: Partial<Pick<Project, 'appUrl' | 'buildCmd' | 'autoScan'>>) =>
    fetch(`/api/projects/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).then(j<Project>),

  screenshot: (id: string) =>
    fetch(`/api/projects/${id}/screenshot`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
      .then(j<{ shot: { url: string }; changeId?: string }>),

  deleteProject: (id: string) => fetch(`/api/projects/${id}`, { method: 'DELETE' }),

  scan: (id: string) =>
    fetch(`/api/projects/${id}/scan`, { method: 'POST' }).then(
      j<{ project: Project; added: Change[] }>,
    ),

  prompt: (id: string, text: string) =>
    fetch(`/api/projects/${id}/prompt`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    }).then(j<{ ok: boolean; note: string; project: Project }>),

  build: (id: string) =>
    fetch(`/api/projects/${id}/build`, { method: 'POST' }).then(
      j<{ status: string; code: number | null; output: string }>,
    ),

  log: (date?: string) =>
    fetch(`/api/log${date ? `?date=${date}` : ''}`).then(j<{ date: string; changes: Change[] }>),

  updateChange: (id: string, patch: Partial<Change>) =>
    fetch(`/api/changes/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    }).then(j<Change>),

  compile: (platform: Platform, date?: string) =>
    fetch('/api/compile', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ platform, date }),
    }).then(j<{ thread: Thread; formatted: Formatted }>),

  export: (thread: Thread, platform: Platform) =>
    fetch('/api/export', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ thread, platform }),
    }).then(j<{ formatted: Formatted }>),

  digest: () => fetch('/api/digest').then(j<Digest>),

  saveThread: (thread: Thread, scheduledFor?: string) =>
    fetch('/api/threads', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ thread, scheduledFor }),
    }).then(j<SavedThread>),

  postThread: (id: string) =>
    fetch(`/api/threads/${id}/post`, { method: 'POST' }).then(
      j<{ delivered: boolean; via: string; detail: string }>,
    ),
};

export interface Digest {
  from: string;
  to: string;
  totalChanges: number;
  activeDays: number;
  streak: number;
  byProject: { projectId: string; name: string; count: number; summaries: string[] }[];
  headline: string;
}

export interface Formatted {
  platform: Platform;
  label: string;
  blocks: string[];
  combined: string;
}
