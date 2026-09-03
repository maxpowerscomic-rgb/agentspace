// Thin client for the wiwo API.
import type { Project, Change, Thread, Platform, SavedThread, PostMode, PostResult, Session } from './types';

export type SessionView = (Session & { remainingSec: number }) | null;

export interface Connection {
  id: string;
  platform: Platform;
  handle: string;
  instance?: string;
  isDefault: boolean;
  connectedAt: string;
  connected: true;
}

export const CHAR_LIMITS: Record<Platform, number> = { x: 280, bs: 300, th: 500, ma: 500, li: 3000 };

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error || `${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  listProjects: () => fetch('/api/projects').then(j<(Project & { todayCount: number })[]>),

  browseFs: (path?: string) =>
    fetch(`/api/fs/list${path ? `?path=${encodeURIComponent(path)}` : ''}`).then(
      j<{ path: string; parent: string | null; home: string; isGit: boolean; entries: { name: string; path: string; isGit: boolean }[] }>,
    ),

  addProject: (body: { name: string; repoPath: string; buildCmd?: string; appUrl?: string; serveCmd?: string; autoScan?: boolean; enrich?: boolean }) =>
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

  retro: (projectId: string, window: 'day' | 'week' | 'month', opts?: { since?: string; platform?: Platform }) =>
    fetch(`/api/projects/${projectId}/retro`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ window, ...opts }),
    }).then(j<{ empty?: boolean; thread: Thread | null; windowCount?: number; commitCount?: number }>),

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

  disconnect: (id: string) => fetch(`/api/connections/${id}`, { method: 'DELETE' }),
  setDefault: (id: string) => fetch(`/api/connections/${id}/default`, { method: 'POST' }),

  oauthStatus: () => fetch('/api/oauth/status').then(j<{ ma: boolean; x: boolean; li: boolean }>),

  oauthStart: (platform: Platform, instance?: string) =>
    fetch(`/api/oauth/${platform}/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ instance }),
    }).then(j<{ authUrl: string }>),

  testConnection: (id: string) =>
    fetch(`/api/connections/${id}/test`, { method: 'POST' }).then(j<PostResult>),

  // ---- v2: focus sessions ----
  getSession: () => fetch('/api/session').then(j<SessionView>),

  startSession: (body: { projectId: string; title: string; intervalMin?: number }) =>
    fetch('/api/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(j<SessionView>),

  scanSprint: (id: string) =>
    fetch(`/api/session/${id}/scan`).then(j<{ line: string; commits: string[]; count: number }>),

  checkin: (id: string, body: { line?: string; auto?: boolean; altProjectId?: string; skipped?: boolean; commits?: string[]; action: 'continue' | 'end' }) =>
    fetch(`/api/session/${id}/checkin`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(j<any>),

  endSession: (id: string, line?: string) =>
    fetch(`/api/session/${id}/end`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ line }) }).then(j<any>),

  sessionThread: (id: string, platform: Platform = 'x') =>
    fetch(`/api/session/${id}/thread?platform=${platform}`).then(j<{ thread: Thread; formatted: Formatted }>),

  publishSession: (id: string, body: { platform: Platform; mode: PostMode; sprintId?: string }) =>
    fetch(`/api/session/${id}/publish`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(j<{ saved: SavedThread; result: PostResult; formatted: Formatted }>),

  // ---- Web Push ----
  pushKey: () => fetch('/api/push/key').then(j<{ key: string | null }>),
  pushSubscribe: (sub: unknown) =>
    fetch('/api/push/subscribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(sub) }).then(j<{ ok: boolean }>),
  pushTest: () => fetch('/api/push/test', { method: 'POST' }).then(j<{ sent: number; pruned: number }>),

  // ---- Saved threads (drafts / scheduled / posted) ----
  listThreads: () => fetch('/api/threads').then(j<SavedThread[]>),
  deleteThread: (id: string) => fetch(`/api/threads/${id}`, { method: 'DELETE' }),
  postSaved: (id: string) => fetch(`/api/threads/${id}/post`, { method: 'POST' }).then(j<PostResult>),
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
