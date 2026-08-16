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
