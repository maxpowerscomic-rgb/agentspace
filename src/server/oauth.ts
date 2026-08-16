// Real OAuth connect flow (Mastodon). Mastodon lets a client register an app
// dynamically per instance (POST /api/v1/apps), so wiwo can do the full
// authorize → callback → token flow with nothing but the instance URL — no
// pre-registered app, no pasted token. (X/LinkedIn need a pre-registered app,
// so they keep the paste-a-token path for now.)
import { randomUUID } from 'crypto';

// Mastodon instances behind a WAF (e.g. mastodon.social) reject API requests
// with no User-Agent. Always send one.
const UA = 'wiwo/1.0 (+https://github.com/maxpowerscomic-rgb/agentspace)';

interface Pending {
  instance: string;
  clientId: string;
  clientSecret: string;
  createdAt: number;
}

// In-memory pending states (local single-user app). Cleared on use / expiry.
const pending = new Map<string, Pending>();
const SCOPES = 'write:statuses read:accounts';

function clean(instance: string): string {
  let u = instance.trim();
  if (!/^https?:\/\//.test(u)) u = `https://${u}`;
  return u.replace(/\/$/, '');
}

/** Register an app on the instance and return the authorize URL to redirect to. */
export async function startMastodon(instanceRaw: string, redirectUri: string): Promise<string> {
  const instance = clean(instanceRaw);

  const appRes = await fetch(`${instance}/api/v1/apps`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': UA, accept: 'application/json' },
    body: new URLSearchParams({
      client_name: 'wiwo',
      redirect_uris: redirectUri,
      scopes: SCOPES,
      website: 'https://github.com/maxpowerscomic-rgb/agentspace',
    }),
  });
  if (!appRes.ok) throw new Error(`Could not register with ${instance} (${appRes.status})`);
  const app: any = await appRes.json();

  const state = randomUUID();
  pending.set(state, { instance, clientId: app.client_id, clientSecret: app.client_secret, createdAt: Date.now() });

  const authUrl = new URL(`${instance}/oauth/authorize`);
  authUrl.searchParams.set('client_id', app.client_id);
  authUrl.searchParams.set('scope', SCOPES);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('state', state);
  return authUrl.toString();
}

export interface MastodonAuth {
  instance: string;
  handle: string;
  token: string;
}

/** Exchange the callback code for a token and verify the account. */
export async function completeMastodon(code: string, state: string, redirectUri: string): Promise<MastodonAuth> {
  const p = pending.get(state);
  pending.delete(state);
  if (!p) throw new Error('Unknown or expired OAuth state');

  const tokRes = await fetch(`${p.instance}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': UA, accept: 'application/json' },
    body: new URLSearchParams({
      client_id: p.clientId,
      client_secret: p.clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code,
      scope: SCOPES,
    }),
  });
  if (!tokRes.ok) throw new Error(`Token exchange failed (${tokRes.status})`);
  const tok: any = await tokRes.json();
  const token = tok.access_token;

  const meRes = await fetch(`${p.instance}/api/v1/accounts/verify_credentials`, {
    headers: { authorization: `Bearer ${token}`, 'user-agent': UA },
  });
  if (!meRes.ok) throw new Error(`Could not verify account (${meRes.status})`);
  const me: any = await meRes.json();
  const host = p.instance.replace(/^https?:\/\//, '');
  const handle = `@${me.username}@${host}`;

  return { instance: p.instance, handle, token };
}

// Drop stale pending states (>10 min) opportunistically.
export function sweepPending(): void {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [k, v] of pending) if (v.createdAt < cutoff) pending.delete(k);
}
