// REST API for wiwo. All routes are read-only against user repos; wiwo only
// mutates its own JSON store.
import type { Express, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import * as store from './store.js';
import { commitsSince, latestCommitSubject, lastCommitTime, isRepo } from './git.js';
import { readTranscript } from './transcript.js';
import { runBuild } from './build.js';
import { summarizeCommit } from './summarize.js';
import { compileThread, formatThread } from './compile.js';
import type { Project, Change, BuildStatus, Platform } from '../types.js';

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
    const { name, repoPath, buildCmd, sessionPath } = req.body ?? {};
    if (!name || !repoPath) return res.status(400).json({ error: 'name and repoPath are required' });
    if (!isRepo(repoPath)) return res.status(400).json({ error: `Not a git repo: ${repoPath}` });

    const t = readTranscript(repoPath, sessionPath);
    const project: Project = {
      id: randomUUID(),
      name,
      repoPath,
      sessionPath: t.sessionFile ?? sessionPath,
      buildCmd,
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
    res.status(201).json(project);
  });

  app.delete('/api/projects/:id', (req: Request, res: Response) => {
    store.deleteProject(req.params.id);
    res.status(204).end();
  });

  // ---- Scan: read git + transcript, produce today's changes ----
  app.post('/api/projects/:id/scan', async (req: Request, res: Response) => {
    const project = store.getProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'project not found' });

    // Refresh latest context from the transcript (passive read).
    const t = readTranscript(project.repoPath, project.sessionPath);
    project.latestContext =
      t.lastAssistantParagraph || t.lastUserPrompt || project.latestContext;
    project.lastActive = t.lastActivity ?? project.lastActive;

    let commits;
    try {
      commits = await commitsSince(project.repoPath, todayISO());
    } catch (e: any) {
      return res.status(400).json({ error: e.message });
    }

    const newChanges: Change[] = [];
    for (const c of commits) {
      const existing = store
        .getChanges()
        .some((x) => x.projectId === project.id && x.commitHash === c.hash);
      if (existing) continue;
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
    res.json({ project, added });
  });

  // ---- Prompt: record a prompt for a project (routes to its session in Phase 2) ----
  app.post('/api/projects/:id/prompt', (req: Request, res: Response) => {
    const project = store.getProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'project not found' });
    const { text } = req.body ?? {};
    if (!text) return res.status(400).json({ error: 'text is required' });
    // Phase 1: record intent + surface it as latest context. Real session
    // routing (writing into the Claude Code session) lands in Phase 2.
    project.latestContext = text;
    project.lastActive = new Date().toISOString();
    store.upsertProject(project);
    res.json({ ok: true, note: 'Prompt recorded. Session routing arrives in Phase 2.', project });
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

  // ---- Reformat an existing thread for a platform ----
  app.post('/api/export', (req: Request, res: Response) => {
    const { thread, platform } = req.body ?? {};
    if (!thread || !platform) return res.status(400).json({ error: 'thread and platform required' });
    res.json({ formatted: formatThread(thread, platform) });
  });

  app.get('/api/health', (_req, res) => res.json({ ok: true, model: process.env.WIWO_MODEL || 'claude-opus-5' }));
}
