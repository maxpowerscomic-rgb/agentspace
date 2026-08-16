// OAuth connect flows + token refresh.
//
//  - Mastodon: dynamic app registration per instance — no pre-setup, just the
//    instance URL.
//  - X (Twitter) & LinkedIn: standard OAuth 2.0 using YOUR app's client id/secret
//    from env (they don't support dynamic registration). X uses PKCE.
//
// Pending states (incl. PKCE verifiers) are persisted to data/.oauth.json so an
// in-flight authorize survives a server restart.
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Platform, SavedConnection } from '../types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PENDING_FILE = path.resolve(__dirname, '../../data/.oauth.json');
const UA = 'wiwo/1.0 (+https://github.com/maxpowerscomic-rgb/agentspace)';

interface Pending {
  platform: Platform;
  instance?: string;
  clientId: string;
  clientSecret?: string;
  verifier?: string; // PKCE
  createdAt: number;
}

function loadPending(): Record<string, Pending> {
  try { return JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8')); } catch { return {}; }
}
function savePending(p: Record<string, Pending>): void {
  try { fs.mkdirSync(path.dirname(PENDING_FILE), { recursive: true }); fs.writeFileSync(PENDING_FILE, JSON.stringify(p), { mode: 0o600 }); } catch { /* ignore */ }
}
export function sweepPending(): void {
  const p = loadPending();
  const cutoff = Date.now() - 10 * 60 * 1000;
  let changed = false;
  for (const k of Object.keys(p)) if (p[k].createdAt < cutoff) { delete p[k]; changed = true; }
  if (changed) savePending(p);
}

function cleanUrl(u: string): string {
  let s = u.trim();
  if (!/^https?:\/\//.test(s)) s = `https://${s}`;
  return s.replace(/\/$/, '');
}

// ---------------- Mastodon (dynamic registration) ----------------
const MA_SCOPES = 'write:statuses read:accounts';

export async function startMastodon(instanceRaw: string, redirectUri: string): Promise<string> {
  const instance = cleanUrl(instanceRaw);
  const appRes = await fetch(`${instance}/api/v1/apps`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': UA, accept: 'application/json' },
    body: new URLSearchParams({ client_name: 'wiwo', redirect_uris: redirectUri, scopes: MA_SCOPES, website: 'https://github.com/maxpowerscomic-rgb/agentspace' }),
  });
  if (!appRes.ok) throw new Error(`Could not register with ${instance} (${appRes.status})`);
  const app: any = await appRes.json();
  const state = crypto.randomUUID();
  const p = loadPending();
  p[state] = { platform: 'ma', instance, clientId: app.client_id, clientSecret: app.client_secret, createdAt: Date.now() };
  savePending(p);
  const url = new URL(`${instance}/oauth/authorize`);
  url.searchParams.set('client_id', app.client_id);
  url.searchParams.set('scope', MA_SCOPES);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', state);
  return url.toString();
}

// ---------------- X (Twitter) OAuth 2.0 + PKCE ----------------
const X_SCOPES = 'tweet.read tweet.write users.read offline.access';

export function xConfigured(): boolean {
  return !!process.env.WIWO_X_CLIENT_ID;
}

export function startX(redirectUri: string): string {
  const clientId = process.env.WIWO_X_CLIENT_ID;
  if (!clientId) throw new Error('Set WIWO_X_CLIENT_ID (and WIWO_X_CLIENT_SECRET) to connect X.');
  const state = crypto.randomUUID();
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const p = loadPending();
  p[state] = { platform: 'x', clientId, clientSecret: process.env.WIWO_X_CLIENT_SECRET, verifier, createdAt: Date.now() };
  savePending(p);
  const url = new URL('https://twitter.com/i/oauth2/authorize');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', X_SCOPES);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

// ---------------- LinkedIn OAuth 2.0 ----------------
const LI_SCOPES = 'w_member_social openid profile';

export function liConfigured(): boolean {
  return !!process.env.WIWO_LI_CLIENT_ID;
}

export function startLinkedIn(redirectUri: string): string {
  const clientId = process.env.WIWO_LI_CLIENT_ID;
  if (!clientId) throw new Error('Set WIWO_LI_CLIENT_ID (and WIWO_LI_CLIENT_SECRET) to connect LinkedIn.');
  const state = crypto.randomUUID();
  const p = loadPending();
  p[state] = { platform: 'li', clientId, clientSecret: process.env.WIWO_LI_CLIENT_SECRET, createdAt: Date.now() };
  savePending(p);
  const url = new URL('https://www.linkedin.com/oauth/v2/authorization');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', LI_SCOPES);
  url.searchParams.set('state', state);
  return url.toString();
}

// ---------------- Callback completion ----------------
export interface OAuthResult {
  platform: Platform;
  handle: string;
  instance?: string;
  token: string;
  refreshToken?: string;
  expiresAt?: string;
  authorId?: string;
}

export async function completeOAuth(code: string, state: string, redirectUri: string): Promise<OAuthResult> {
  const pending = loadPending();
  const p = pending[state];
  if (!p) throw new Error('Unknown or expired OAuth state');
  delete pending[state];
  savePending(pending);

  if (p.platform === 'ma') return completeMastodon(p, code, redirectUri);
  if (p.platform === 'x') return completeX(p, code, redirectUri);
  if (p.platform === 'li') return completeLinkedIn(p, code, redirectUri);
  throw new Error(`Unsupported OAuth platform ${p.platform}`);
}

function expiryFrom(seconds?: number): string | undefined {
  return seconds ? new Date(Date.now() + seconds * 1000).toISOString() : undefined;
}

async function completeMastodon(p: Pending, code: string, redirectUri: string): Promise<OAuthResult> {
  const tokRes = await fetch(`${p.instance}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': UA, accept: 'application/json' },
    body: new URLSearchParams({ client_id: p.clientId, client_secret: p.clientSecret || '', redirect_uri: redirectUri, grant_type: 'authorization_code', code, scope: MA_SCOPES }),
  });
  if (!tokRes.ok) throw new Error(`Token exchange failed (${tokRes.status})`);
  const tok: any = await tokRes.json();
  const me: any = await (await fetch(`${p.instance}/api/v1/accounts/verify_credentials`, { headers: { authorization: `Bearer ${tok.access_token}`, 'user-agent': UA } })).json();
  const host = (p.instance || '').replace(/^https?:\/\//, '');
  return { platform: 'ma', instance: p.instance, handle: `@${me.username}@${host}`, token: tok.access_token };
}

async function completeX(p: Pending, code: string, redirectUri: string): Promise<OAuthResult> {
  const headers: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded' };
  if (p.clientSecret) headers.authorization = `Basic ${Buffer.from(`${p.clientId}:${p.clientSecret}`).toString('base64')}`;
  const tokRes = await fetch('https://api.twitter.com/2/oauth2/token', {
    method: 'POST', headers,
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: p.clientId, code_verifier: p.verifier || '' }),
  });
  if (!tokRes.ok) throw new Error(`X token exchange failed (${tokRes.status})`);
  const tok: any = await tokRes.json();
  const me: any = await (await fetch('https://api.twitter.com/2/users/me', { headers: { authorization: `Bearer ${tok.access_token}` } })).json();
  return { platform: 'x', handle: me?.data?.username || 'x', token: tok.access_token, refreshToken: tok.refresh_token, expiresAt: expiryFrom(tok.expires_in), authorId: me?.data?.id };
}

async function completeLinkedIn(p: Pending, code: string, redirectUri: string): Promise<OAuthResult> {
  const tokRes = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: p.clientId, client_secret: p.clientSecret || '' }),
  });
  if (!tokRes.ok) throw new Error(`LinkedIn token exchange failed (${tokRes.status})`);
  const tok: any = await tokRes.json();
  const me: any = await (await fetch('https://api.linkedin.com/v2/userinfo', { headers: { authorization: `Bearer ${tok.access_token}` } })).json();
  return { platform: 'li', handle: me?.name || 'linkedin', token: tok.access_token, refreshToken: tok.refresh_token, expiresAt: expiryFrom(tok.expires_in), authorId: me?.sub ? `urn:li:person:${me.sub}` : undefined };
}

// ---------------- Token refresh ----------------
/** Refresh a connection's token if it's near expiry and a refresh token exists. */
export async function refreshIfNeeded(conn: SavedConnection): Promise<SavedConnection> {
  if (!conn.expiresAt || !conn.refreshToken) return conn;
  if (new Date(conn.expiresAt).getTime() - Date.now() > 120_000) return conn; // >2 min left
  try {
    if (conn.platform === 'x') {
      const clientId = process.env.WIWO_X_CLIENT_ID!;
      const secret = process.env.WIWO_X_CLIENT_SECRET;
      const headers: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded' };
      if (secret) headers.authorization = `Basic ${Buffer.from(`${clientId}:${secret}`).toString('base64')}`;
      const r = await fetch('https://api.twitter.com/2/oauth2/token', { method: 'POST', headers, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: conn.refreshToken, client_id: clientId }) });
      if (r.ok) { const t: any = await r.json(); return { ...conn, token: t.access_token, refreshToken: t.refresh_token ?? conn.refreshToken, expiresAt: expiryFrom(t.expires_in) }; }
    } else if (conn.platform === 'li') {
      const r = await fetch('https://www.linkedin.com/oauth/v2/accessToken', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: conn.refreshToken, client_id: process.env.WIWO_LI_CLIENT_ID!, client_secret: process.env.WIWO_LI_CLIENT_SECRET || '' }) });
      if (r.ok) { const t: any = await r.json(); return { ...conn, token: t.access_token, refreshToken: t.refresh_token ?? conn.refreshToken, expiresAt: expiryFrom(t.expires_in) }; }
    }
  } catch { /* keep existing token; post will surface any auth error */ }
  return conn;
}
