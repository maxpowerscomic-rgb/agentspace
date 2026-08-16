// Pure-logic tests. Run: npm test  (node --test via tsx)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encrypt, decrypt, isEncrypted } from '../src/server/crypto.js';
import { checkBlocks, anyOver, CHAR_LIMITS } from '../src/server/limits.js';
import { computeStreak, weeklyDigest } from '../src/server/digest.js';
import { compileThread, formatThread } from '../src/server/compile.js';
import type { Project, Change } from '../src/types.js';

// ---- crypto ----
test('encrypt/decrypt round-trips and marks ciphertext', () => {
  const secret = 'sk-ant-super-secret-token';
  const enc = encrypt(secret)!;
  assert.ok(isEncrypted(enc), 'ciphertext is tagged');
  assert.notEqual(enc, secret, 'value is actually transformed');
  assert.equal(decrypt(enc), secret, 'round-trips back');
});
test('decrypt passes through legacy plaintext', () => {
  assert.equal(decrypt('plain-token'), 'plain-token');
  assert.equal(isEncrypted('plain-token'), false);
});
test('encrypt is idempotent (does not double-encrypt)', () => {
  const once = encrypt('abc')!;
  assert.equal(encrypt(once), once);
});

// ---- limits ----
test('char limits flag over-length posts per platform', () => {
  const long = 'x'.repeat(CHAR_LIMITS.x + 5);
  const checks = checkBlocks(['ok', long], 'x');
  assert.equal(checks[0].over, false);
  assert.equal(checks[1].over, true);
  assert.equal(anyOver(['ok', long], 'x'), true);
  assert.equal(anyOver([long], 'li'), false, 'LinkedIn allows longer');
});

// ---- digest / streak ----
function change(day: string, projectId = 'p1'): Change {
  return { id: Math.random().toString(36), projectId, timestamp: `${day}T10:00:00.000Z`, summary: 's', filesTouched: [], buildStatus: 'unknown' };
}
function isoDay(offset: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}
test('streak counts consecutive active days ending today', () => {
  const changes = [change(isoDay(0)), change(isoDay(-1)), change(isoDay(-2))];
  assert.equal(computeStreak(changes), 3);
});
test('streak breaks on a gap', () => {
  const changes = [change(isoDay(0)), change(isoDay(-2))]; // missing yesterday
  assert.equal(computeStreak(changes), 1);
});
test('weekly digest rolls up by project', () => {
  const projects: Project[] = [{ id: 'p1', name: 'alpha', repoPath: '/x', buildStatus: 'unknown', latestContext: '', createdAt: isoDay(0) }];
  const d = weeklyDigest(projects, [change(isoDay(0)), change(isoDay(-1))]);
  assert.equal(d.totalChanges, 2);
  assert.equal(d.byProject[0].name, 'alpha');
  assert.match(d.headline, /2 changes/);
});

// ---- compile / format ----
const proj: Project[] = [
  { id: 'p1', name: 'notebook', repoPath: '/a', buildStatus: 'passing', latestContext: '', createdAt: '2026-01-01' },
  { id: 'p2', name: 'client-crm', repoPath: '/b', buildStatus: 'failing', latestContext: '', createdAt: '2026-01-01' },
];
const changes: Change[] = [
  { id: 'c1', projectId: 'p1', timestamp: '2026-08-16T10:00:00Z', summary: 'added notebook', filesTouched: ['a.ts'], buildStatus: 'passing' },
  { id: 'c2', projectId: 'p2', timestamp: '2026-08-16T11:00:00Z', summary: 'fixed auth', filesTouched: ['b.ts'], buildStatus: 'failing' },
];
test('compileThread groups by project with an intro', () => {
  const t = compileThread(proj, changes, 'x');
  assert.equal(t.posts.length, 2);
  assert.match(t.intro, /2 projects/);
  assert.ok(t.posts[0].text.includes('notebook'));
});
test('formatThread numbers X but not LinkedIn, and drops tags on Threads', () => {
  const t = compileThread(proj, changes, 'x');
  const x = formatThread(t, 'x');
  assert.ok(x.blocks[0].startsWith('1/'), 'X is numbered');
  assert.ok(x.combined.includes('#buildinpublic'), 'X keeps hashtags');
  const li = formatThread(t, 'li');
  assert.ok(!li.blocks[0].startsWith('1/'), 'LinkedIn is not numbered');
  const th = formatThread(t, 'th');
  assert.ok(!th.blocks[0].includes('#buildinpublic'), 'Threads drops hashtags');
});
