// Thin client for the wiwo API.
import type { Project, Change, Thread, Platform, SavedThread, PostMode, PostResult } from './types';

export interface Connection {
  platform: Platform;
  handle: string;
  instance?: string;
  connectedAt: string;
  connected: true;
}

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error || `${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  listProjects: () => fetch('/api/projects').then(j<(Project & { todayCount: number })[]>),

  addProject: (body: { name: string; repoPath: string; buildCmd?: string; appUrl?: string; autoScan?: boolean; enrich?: boolean }) =>
    fetch('/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).then(j<Project>),

  patchProject: (id: string, body: Partial<Pick<Project, 'appUrl' | 'buildCmd' | 'autoScan' | 'enrich'>>) =>
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

  // Streams the agent's reply token-by-token via SSE. onDelta fires per chunk;
  // resolves with the final {live, reply, note}.
  promptStream: async (
    id: string,
    text: string,
    onDelta: (chunk: string) => void,
  ): Promise<{ live: boolean; reply: string; note?: string }> => {
    const res = await fetch(`/api/projects/${id}/prompt`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.body) return { live: false, reply: '', note: 'no stream' };
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let done: { live: boolean; reply: string; note?: string } = { live: false, reply: '', note: '' };
    for (;;) {
      const { value, done: fin } = await reader.read();
      if (fin) break;
      buf += decoder.decode(value, { stream: true });
      const frames = buf.split('\n\n');
      buf = frames.pop() ?? '';
      for (const frame of frames) {
        const ev = /event: (\w+)/.exec(frame)?.[1];
        const dm = /data: (.*)$/s.exec(frame)?.[1];
        if (!ev || !dm) continue;
        const data = JSON.parse(dm);
        if (ev === 'delta') onDelta(data.chunk);
        else if (ev === 'done') done = data;
      }
    }
    return done;
  },

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

  saveThread: (thread: Thread, opts?: { scheduledFor?: string; mode?: PostMode }) =>
    fetch('/api/threads', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ thread, ...opts }),
    }).then(j<SavedThread>),

  postThread: (id: string) =>
    fetch(`/api/threads/${id}/post`, { method: 'POST' }).then(j<PostResult>),

  // ---- Connections ----
  connections: () => fetch('/api/connections').then(j<Connection[]>),

  connect: (body: { platform: Platform; handle: string; instance?: string; token?: string; appPassword?: string; authorId?: string }) =>
    fetch('/api/connections', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).then(j<Connection>),

  disconnect: (platform: Platform) => fetch(`/api/connections/${platform}`, { method: 'DELETE' }),

  oauthMastodonStart: (instance: string) =>
    fetch('/api/oauth/mastodon/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ instance }),
    }).then(j<{ authUrl: string }>),

  testConnection: (platform: Platform) =>
    fetch(`/api/connections/${platform}/test`, { method: 'POST' }).then(j<PostResult>),
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
