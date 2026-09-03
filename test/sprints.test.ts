// Focus-session engine tests. Runs against a throwaway data file so it never
// touches the real store. Uses interval 0-ish and manual check-ins (no real
// timers waited on).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Point the store at a temp file BEFORE importing anything that reads it.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wiwo-test-'));
process.env.WIWO_DATA_FILE = path.join(tmp, 'wiwo.json');
process.env.WIWO_AI_MODE = 'api'; // force bridge off so generate() returns null (no CLI)

const store = await import('../src/server/store.ts');
const { startSession, checkin, endSession, compileSession, compileSprint } = await import('../src/server/sprints.ts');

before(() => {
  store.upsertProject({
    id: 'p1', name: 'notebook-app', repoPath: '/nonexistent-repo',
    buildStatus: 'unknown', latestContext: '', createdAt: new Date().toISOString(),
  });
});

after(() => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ } });

test('start creates a running session with one open sprint', () => {
  const s = startSession({ projectId: 'p1', title: 'Ship dark mode', intervalMin: 30 })!;
  assert.equal(s.status, 'running');
  assert.equal(s.sprints.length, 1);
  assert.equal(s.title, 'Ship dark mode');
  assert.ok(s.checkinDueAt);
  assert.equal(store.getActiveSession()?.id, s.id);
});

test('interval is clamped to a sane range', () => {
  const s = startSession({ projectId: 'p1', title: 'x', intervalMin: 9999 })!;
  assert.ok(s.intervalMin <= 180);
  const s2 = startSession({ projectId: 'p1', title: 'y', intervalMin: -5 })!;
  assert.ok(s2.intervalMin >= 1);
});

test('checkin continue logs the sprint and opens the next', () => {
  const s = startSession({ projectId: 'p1', title: 'Task A', intervalMin: 25 })!;
  const s2 = checkin(s.id, { line: 'Scaffolded the settings panel', action: 'continue' })!;
  assert.equal(s2.sprints.length, 2);
  assert.equal(s2.sprints[0].line, 'Scaffolded the settings panel');
  assert.ok(s2.sprints[0].endedAt);
  assert.equal(s2.status, 'running');
});

test('starting a new session ends the previous one', () => {
  const a = startSession({ projectId: 'p1', title: 'First', intervalMin: 30 })!;
  const b = startSession({ projectId: 'p1', title: 'Second', intervalMin: 30 })!;
  assert.notEqual(a.id, b.id);
  assert.equal(store.getSession(a.id)?.status, 'ended');
  assert.equal(store.getActiveSession()?.id, b.id);
});

test('end compiles a thread from logged sprints', () => {
  const s = startSession({ projectId: 'p1', title: 'Ship dark mode', intervalMin: 30 })!;
  checkin(s.id, { line: 'Scaffolded the settings panel', action: 'continue' });
  checkin(s.id, { line: 'Wired the theme toggle', action: 'continue' });
  const ended = endSession(s.id, 'Fixed the dark-mode flash')!;
  assert.equal(ended.status, 'ended');
  assert.ok(ended.endedAt);

  const { thread } = compileSession(ended, 'x');
  assert.ok(thread.intro.includes('Ship dark mode'));
  assert.ok(thread.posts.length >= 1);
  // all three lines should appear somewhere in the thread text
  const all = thread.posts.map((p) => p.text).join('\n');
  assert.ok(all.includes('settings panel'));
  assert.ok(all.includes('theme toggle'));
  assert.ok(all.includes('dark-mode flash'));
});

test('a single sprint compiles to its own one-post thread', () => {
  const s = startSession({ projectId: 'p1', title: 'Task B', intervalMin: 30 })!;
  const s2 = checkin(s.id, { line: 'Did one thing', action: 'continue' })!;
  const sprintId = s2.sprints[0].id;
  const compiled = compileSprint(store.getSession(s.id)!, sprintId, 'x')!;
  assert.ok(compiled);
  assert.ok(compiled.formatted.combined.includes('Did one thing'));
});

test('skipped sprints (no line) are excluded from the thread', () => {
  const s = startSession({ projectId: 'p1', title: 'Task C', intervalMin: 30 })!;
  checkin(s.id, { line: '', action: 'continue' }); // skipped
  checkin(s.id, { line: 'Only real line', action: 'continue' });
  const ended = endSession(s.id)!;
  const { thread } = compileSession(ended, 'x');
  const all = thread.posts.map((p) => p.text).join('\n');
  assert.ok(all.includes('Only real line'));
  assert.equal((all.match(/•/g) || []).length, 1);
});
