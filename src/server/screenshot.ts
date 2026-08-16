// Playwright screenshots of a project's running app (Phase 2). This is the
// "app screenshot" tier of before/after capture. It stays true to wiwo's
// read-only principle: it never checks out old commits or mutates the repo — it
// snaps the app as it runs *now*. The previous "after" becomes the next
// "before", so consecutive changes show real visual deltas.
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS_DIR = path.resolve(__dirname, '../../uploads');
if (!fs.existsSync(SHOTS_DIR)) fs.mkdirSync(SHOTS_DIR, { recursive: true });

export interface ShotResult {
  url: string; // served path, e.g. /uploads/shot-xyz.png
  file: string;
}

/**
 * Render a PAST commit and screenshot it — true "before" capture. Adds a
 * throwaway git worktree at `ref` (never touches the user's working tree or
 * branch), runs `serveCmd` there on a temp port, screenshots, and tears it all
 * down. Returns null on any failure. This is the read-only way to get a real
 * old-vs-new visual: the working tree is left exactly as it was.
 */
export async function captureCommit(
  repoPath: string,
  ref: string,
  serveCmd: string,
  label = 'before',
): Promise<ShotResult | null> {
  const { execFile, spawn } = await import('child_process');
  const { promisify } = await import('util');
  const os = await import('os');
  const exec = promisify(execFile);
  const port = 4100 + Math.floor((Date.now() % 800));
  const worktree = path.join(os.tmpdir(), `wiwo-wt-${Date.now()}`);
  let child: any;
  try {
    await exec('git', ['-C', repoPath, 'worktree', 'add', '--detach', worktree, ref], { timeout: 30000 });
    child = spawn(serveCmd, { cwd: worktree, env: { ...process.env, PORT: String(port) }, shell: true, stdio: 'ignore', detached: true });
    // Give the server a moment to boot, then screenshot.
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ args: ['--no-sandbox'] });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      // Retry navigation while the dev server spins up.
      let ok = false;
      for (let i = 0; i < 10 && !ok; i++) {
        try { await page.goto(`http://localhost:${port}`, { waitUntil: 'networkidle', timeout: 4000 }); ok = true; }
        catch { await new Promise((r) => setTimeout(r, 1500)); }
      }
      if (!ok) return null;
      const name = `${label}-${Date.now()}.png`;
      const file = path.join(SHOTS_DIR, name);
      await page.screenshot({ path: file });
      return { url: `/uploads/${name}`, file };
    } finally {
      await browser.close().catch(() => {});
    }
  } catch {
    return null;
  } finally {
    try { if (child?.pid) process.kill(-child.pid); } catch { /* already gone */ }
    try { await exec('git', ['-C', repoPath, 'worktree', 'remove', '--force', worktree], { timeout: 15000 }); } catch { /* leave it; git prunes */ }
  }
}

/**
 * Navigate to `appUrl` and capture a screenshot. Returns null (never throws)
 * if Playwright is unavailable or the app can't be reached — the caller keeps
 * the rendered-diff card as its fallback.
 */
export async function captureApp(appUrl: string, label = 'shot'): Promise<ShotResult | null> {
  let browser: any;
  try {
    // Lazy import so the server boots even if Playwright's browser isn't installed.
    const { chromium } = await import('playwright');
    browser = await chromium.launch({ args: ['--no-sandbox'] });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(appUrl, { waitUntil: 'networkidle', timeout: 15000 });
    const name = `${label}-${Date.now()}.png`;
    const file = path.join(SHOTS_DIR, name);
    await page.screenshot({ path: file, fullPage: false });
    return { url: `/uploads/${name}`, file };
  } catch {
    return null;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
