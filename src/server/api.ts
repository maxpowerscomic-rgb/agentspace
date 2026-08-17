// REST API for wiwo. All routes are read-only against user repos; wiwo only
// mutates its own JSON store.
import type { Express, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import * as store from './store.js';
import { latestCommitSubject, lastCommitTime, isRepo, historyCommits } from './git.js';
import { buildRetro } from './retro.js';
import { readTranscript } from './transcript.js';
import { runBuild } from './build.js';
import { compileThread, formatThread } from './compile.js';
import { scanProject } from './scanner.js';
import { streamToSession } from './session.js';
import { captureApp, captureCommit } from './screenshot.js';
import { watchProject, unwatchProject, watchEvents } from './watcher.js';
import { weeklyDigest, computeStreak } from './digest.js';
import { postThread } from './poster.js';
import { activeProvider, bridgeEnabled } from './providers.js';
import { postToPlatform } from './native.js';
import { startMastodon, startX, startLinkedIn, completeOAuth, sweepPending, xConfigured, liConfigured } from './oauth.js';
import type { Project, Change, BuildStatus, Platform, SavedThread, SavedConnection, PostMode } from '../types.js';

function redactConn(c: SavedConnection) {
  return { id: c.id, platform: c.platform, handle: c.handle, instance: c.instance, isDefault: !!c.isDefault, connectedAt: c.connectedAt, connected: true };
}

function redirectUriFor(req: Request): string {
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
  const host = req.headers.host;
  return `${proto}://${host}/api/oauth/callback`;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.resolve(__dirname, '../../uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const upload = multer({ dest: UPLOAD_DIR });

function todayISO(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
function isToday(iso: string): boolean {
  return new Date(iso) >= new Date(todayISO());
}

export function setupApiRoutes(app: Express): void {
  // ---- Projects ----
  app.get('/api/projects', (_req: Request, res: Response) => {
    const projects = store.getProjects();
    const changes = store.getChanges();
    const enriched = projects.map((p) => ({
      ...p,
      todayCount: changes.filter((c) => c.projectId === p.id && isToday(c.timestamp)).length,
    }));
    res.json(enriched);
  });

  app.post('/api/projects', async (req: Request, res: Response) => {
    const { name, repoPath, buildCmd, sessionPath, appUrl, serveCmd, autoScan, enrich } = req.body ?? {};
    if (!name || !repoPath) return res.status(400).json({ error: 'name and repoPath are required' });
    if (!isRepo(repoPath)) return res.status(400).json({ error: `Not a git repo: ${repoPath}` });

    const t = readTranscript(repoPath, sessionPath);
    const project: Project = {
      id: randomUUID(),
      name,
      repoPath,
      sessionPath: t.sessionFile ?? sessionPath,
      buildCmd,
      appUrl,
      serveCmd,
      autoScan: !!autoScan,
      enrich: !!enrich,
      buildStatus: 'unknown',
      latestContext:
        t.lastAssistantParagraph ||
        t.lastUserPrompt ||
        (await latestCommitSubject(repoPath)) ||
        'No activity yet',
      lastActive: t.lastActivity ?? (await lastCommitTime(repoPath)),
      createdAt: new Date().toISOString(),
    };
    store.upsertProject(project);
    if (project.autoScan) watchProject(project.id);
    res.status(201).json(project);
  });

  // Update settings (appUrl, buildCmd, autoScan toggle).
  app.patch('/api/projects/:id', (req: Request, res: Response) => {
    const project = store.getProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'project not found' });
    const { appUrl, buildCmd, serveCmd, autoScan, enrich } = req.body ?? {};
    if (appUrl !== undefined) project.appUrl = appUrl;
    if (serveCmd !== undefined) project.serveCmd = serveCmd;
    if (buildCmd !== undefined) project.buildCmd = buildCmd;
    if (enrich !== undefined) project.enrich = !!enrich;
    if (autoScan !== undefined) {
      project.autoScan = !!autoScan;
      if (project.autoScan) watchProject(project.id);
      else unwatchProject(project.id);
    }
    store.upsertProject(project);
    res.json(project);
  });

  app.delete('/api/projects/:id', (req: Request, res: Response) => {
    unwatchProject(req.params.id);
    store.deleteProject(req.params.id);
    res.status(204).end();
  });

  // ---- Scan: read git + transcript, produce today's changes ----
  app.post('/api/projects/:id/scan', async (req: Request, res: Response) => {
    const project = store.getProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'project not found' });
    try {
      const result = await scanProject(project);
      res.json(result);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // ---- Screenshot: capture the running app, attach before/after to a change ----
  app.post('/api/projects/:id/screenshot', async (req: Request, res: Response) => {
    const project = store.getProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'project not found' });
    const url = (req.body?.appUrl as string) || project.appUrl;
    if (!url) return res.status(400).json({ error: 'no appUrl configured' });

    const shot = await captureApp(url, project.name.replace(/\W+/g, '-'));
    if (!shot) {
      return res.status(502).json({ error: 'screenshot failed — app unreachable or Playwright browser missing' });
    }
    // Attach to the most recent change: the previous "after" becomes "before".
    const changeId = req.body?.changeId as string | undefined;
    const target = changeId
      ? store.getChange(changeId)
      : store.getChanges().filter((c) => c.projectId === project.id).sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
    if (target) {
      const patch: Partial<Change> = { afterImg: shot.url };
      // True before/after: if a serveCmd is set, render the change's PARENT
      // commit in a throwaway worktree instead of reusing the prior "after".
      if (project.serveCmd && target.commitHash) {
        const before = await captureCommit(project.repoPath, `${target.commitHash}~1`, project.serveCmd, 'before');
        if (before) patch.beforeImg = before.url;
      }
      if (!patch.beforeImg && target.afterImg && !target.beforeImg) patch.beforeImg = target.afterImg;
      store.updateChange(target.id, patch);
    }
    res.json({ shot, changeId: target?.id });
  });

  // ---- Prompt: drive the project's live Claude Code session (Phase 4) ----
  app.post('/api/projects/:id/prompt', async (req: Request, res: Response) => {
    const project = store.getProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'project not found' });
    const { text } = req.body ?? {};
    if (!text) return res.status(400).json({ error: 'text is required' });

    project.latestContext = text;
    project.lastActive = new Date().toISOString();
    store.upsertProject(project);

    // Stream the agent's reply token-by-token over SSE.
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

    const reply = await streamToSession(project, text, (chunk) => send('delta', { chunk }));

    if (reply.available) {
      const fresh = store.getProject(project.id);
      if (fresh) { try { await scanProject(fresh); } catch { /* non-fatal */ } }
      send('done', { live: true, reply: reply.text, note: reply.note });
    } else {
      send('done', { live: false, reply: '', note: reply.note });
    }
    res.end();
  });

  // ---- Build: run the project's build command and update status ----
  app.post('/api/projects/:id/build', async (req: Request, res: Response) => {
    const project = store.getProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'project not found' });
    if (!project.buildCmd) return res.status(400).json({ error: 'no buildCmd configured' });

    project.buildStatus = 'building';
    store.upsertProject(project);
    const result = await runBuild(project.repoPath, project.buildCmd);
    project.buildStatus = result.status as BuildStatus;
    store.upsertProject(project);
    res.json({ status: result.status, code: result.code, output: result.output });
  });

  // ---- Daily log ----
  app.get('/api/log', (req: Request, res: Response) => {
    const dateStr = (req.query.date as string) || new Date().toISOString().slice(0, 10);
    const changes = store
      .getChanges()
      .filter((c) => c.timestamp.slice(0, 10) === dateStr)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    res.json({ date: dateStr, changes });
  });

  // ---- Update a change (add/edit a user note, attach images) ----
  app.patch('/api/changes/:id', (req: Request, res: Response) => {
    const { userNote, beforeImg, afterImg } = req.body ?? {};
    const patch: Partial<Change> = {};
    if (userNote !== undefined) patch.userNote = userNote;
    if (beforeImg !== undefined) patch.beforeImg = beforeImg;
    if (afterImg !== undefined) patch.afterImg = afterImg;
    const updated = store.updateChange(req.params.id, patch);
    if (!updated) return res.status(404).json({ error: 'change not found' });
    res.json(updated);
  });

  // ---- Image upload (manual before/after capture) ----
  app.post('/api/upload', upload.single('file'), (req: Request, res: Response) => {
    if (!req.file) return res.status(400).json({ error: 'no file' });
    res.json({ url: `/uploads/${req.file.filename}` });
  });

  // ---- Compile a shareable thread from a day's changes ----
  app.post('/api/compile', (req: Request, res: Response) => {
    const dateStr = (req.body?.date as string) || new Date().toISOString().slice(0, 10);
    const platform: Platform = (req.body?.platform as Platform) || 'x';
    const projects = store.getProjects();
    const changes = store
      .getChanges()
      .filter((c) => c.timestamp.slice(0, 10) === dateStr)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const thread = compileThread(projects, changes, platform);
    res.json({ thread, formatted: formatThread(thread, platform) });
  });

  // ---- Retrospective: build a thread from a project's git history ----
  app.post('/api/projects/:id/retro', async (req: Request, res: Response) => {
    const project = store.getProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'project not found' });
    const window = (req.body?.window as 'day' | 'week' | 'month') || 'week';
    const platform: Platform = (req.body?.platform as Platform) || 'x';
    const { since, until, max } = req.body ?? {};
    try {
      const commits = await historyCommits(project.repoPath, { since, until, max: max ?? 2000 });
      if (commits.length === 0) return res.json({ empty: true, thread: null });
      const result = await buildRetro(project.name, commits, window, platform);
      res.json({ ...result, formatted: formatThread(result.thread, platform) });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // ---- Reformat an existing thread for a platform ----
  app.post('/api/export', (req: Request, res: Response) => {
    const { thread, platform } = req.body ?? {};
    if (!thread || !platform) return res.status(400).json({ error: 'thread and platform required' });
    res.json({ formatted: formatThread(thread, platform) });
  });

  // ---- Weekly digest + streak (Phase 3) ----
  app.get('/api/digest', (_req: Request, res: Response) => {
    res.json(weeklyDigest(store.getProjects(), store.getChanges()));
  });
  app.get('/api/streak', (_req: Request, res: Response) => {
    res.json({ streak: computeStreak(store.getChanges()) });
  });

  // ---- Saved threads: draft / schedule / post (Phase 2/3) ----
  app.get('/api/threads', (_req: Request, res: Response) => res.json(store.getThreads()));

  app.post('/api/threads', (req: Request, res: Response) => {
    const { thread, scheduledFor, mode } = req.body ?? {};
    if (!thread) return res.status(400).json({ error: 'thread is required' });
    const now = new Date().toISOString();
    const saved: SavedThread = {
      id: randomUUID(),
      thread,
      createdAt: now,
      updatedAt: now,
      scheduledFor: scheduledFor || undefined,
      status: scheduledFor ? 'scheduled' : 'draft',
      mode: (mode as PostMode) || 'author',
    };
    store.upsertThread(saved);
    res.status(201).json(saved);
  });

  app.patch('/api/threads/:id', (req: Request, res: Response) => {
    const saved = store.getThread(req.params.id);
    if (!saved) return res.status(404).json({ error: 'thread not found' });
    const { thread, scheduledFor, status } = req.body ?? {};
    const next: SavedThread = {
      ...saved,
      thread: thread ?? saved.thread,
      scheduledFor: scheduledFor === null ? undefined : scheduledFor ?? saved.scheduledFor,
      status: status ?? (scheduledFor ? 'scheduled' : saved.status),
      updatedAt: new Date().toISOString(),
    };
    store.upsertThread(next);
    res.json(next);
  });

  app.post('/api/threads/:id/post', async (req: Request, res: Response) => {
    const saved = store.getThread(req.params.id);
    if (!saved) return res.status(404).json({ error: 'thread not found' });
    const result = await postThread(saved);
    store.upsertThread({
      ...saved,
      status: result.ok ? 'posted' : saved.status,
      postedAt: result.ok ? new Date().toISOString() : saved.postedAt,
      lastResult: result,
      updatedAt: new Date().toISOString(),
    });
    res.json(result);
  });

  app.delete('/api/threads/:id', (req: Request, res: Response) => {
    store.deleteThread(req.params.id);
    res.status(204).end();
  });

  // ---- Platform connections for native posting (multi-account) ----
  app.get('/api/connections', (_req: Request, res: Response) => {
    res.json(store.getConnections().map(redactConn));
  });
  // Which platforms have OAuth available (vs. paste-a-token).
  app.get('/api/oauth/status', (_req: Request, res: Response) => {
    res.json({ ma: true, x: xConfigured(), li: liConfigured() });
  });

  app.post('/api/connections', (req: Request, res: Response) => {
    const { platform, handle, instance, token, appPassword, authorId } = req.body ?? {};
    if (!platform || !handle) return res.status(400).json({ error: 'platform and handle are required' });
    const conn: SavedConnection = {
      id: randomUUID(), platform, handle, instance, token, appPassword, authorId,
      connectedAt: new Date().toISOString(),
    };
    store.upsertConnection(conn);
    res.status(201).json(redactConn(conn));
  });

  app.post('/api/connections/:id/default', (req: Request, res: Response) => {
    store.setDefaultConnection(req.params.id);
    res.json({ ok: true });
  });

  app.delete('/api/connections/:id', (req: Request, res: Response) => {
    store.deleteConnection(req.params.id);
    res.status(204).end();
  });

  app.post('/api/connections/:id/test', async (req: Request, res: Response) => {
    const conn = store.getConnectionById(req.params.id);
    if (!conn) return res.status(404).json({ error: 'not connected' });
    const result = await postToPlatform(conn.platform, ['wiwo connected ✅ (test post)'], conn);
    res.json(result);
  });

  // ---- OAuth start (ma dynamic; x/li via your app creds) ----
  app.post('/api/oauth/:platform/start', async (req: Request, res: Response) => {
    sweepPending();
    const platform = req.params.platform as Platform;
    try {
      let authUrl: string;
      if (platform === 'ma') {
        const { instance } = req.body ?? {};
        if (!instance) return res.status(400).json({ error: 'instance is required' });
        authUrl = await startMastodon(instance, redirectUriFor(req));
      } else if (platform === 'x') {
        authUrl = startX(redirectUriFor(req));
      } else if (platform === 'li') {
        authUrl = startLinkedIn(redirectUriFor(req));
      } else {
        return res.status(400).json({ error: `No OAuth flow for ${platform}` });
      }
      res.json({ authUrl });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get('/api/oauth/callback', async (req: Request, res: Response) => {
    const { code, state, error } = req.query as Record<string, string>;
    if (error) return res.redirect(`/?oauth=error&reason=${encodeURIComponent(error)}#connect`);
    if (!code || !state) return res.redirect('/?oauth=error&reason=missing_code#connect');
    try {
      const auth = await completeOAuth(code, state, redirectUriFor(req));
      store.upsertConnection({
        id: randomUUID(),
        platform: auth.platform,
        handle: auth.handle,
        instance: auth.instance,
        token: auth.token,
        refreshToken: auth.refreshToken,
        expiresAt: auth.expiresAt,
        authorId: auth.authorId,
        connectedAt: new Date().toISOString(),
      });
      res.redirect('/?oauth=ok#connect');
    } catch (e: any) {
      res.redirect(`/?oauth=error&reason=${encodeURIComponent(e.message)}#connect`);
    }
  });

  // ---- SSE: push auto-scan events to the dashboard (Phase 2) ----
  app.get('/api/events', (_req: Request, res: Response) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write(': connected\n\n');
    const onScan = (payload: unknown) => res.write(`event: scanned\ndata: ${JSON.stringify(payload)}\n\n`);
    watchEvents.on('scanned', onScan);
    const ping = setInterval(() => res.write(': ping\n\n'), 25000);
    _req.on('close', () => {
      clearInterval(ping);
      watchEvents.off('scanned', onScan);
    });
  });

  app.get('/api/health', (_req, res) =>
    res.json({
      ok: true,
      provider: activeProvider(),
      bridge: bridgeEnabled(),
      model: process.env.WIWO_MODEL || 'claude-opus-5',
    }),
  );
}
