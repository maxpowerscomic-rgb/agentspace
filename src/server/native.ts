// Native platform posting. Given the per-post text blocks of a compiled thread
// and a stored connection, post to the real platform — threaded where the
// platform supports it. Everything returns a PostResult (never throws) so the
// caller can report success/permalink or a clear failure reason.
//
// Mastodon and Bluesky work with just a user token / app password (no OAuth app
// review), so they're fully implemented incl. reply-chain threading. X and
// LinkedIn need a user access token from your own registered app; supply it as
// the connection token and wiwo posts with it.
import { checkBlocks } from './limits.js';
import type { Platform, SavedConnection, PostResult } from '../types.js';

export async function postToPlatform(
  platform: Platform,
  blocks: string[],
  conn: SavedConnection,
  images: string[] = [],
): Promise<PostResult> {
  // Guard length before hitting the API so failures are explained, not opaque.
  const over = checkBlocks(blocks, platform).filter((c) => c.over);
  if (over.length) {
    const which = over.map((c) => `post ${c.index + 1} (${c.length}/${c.limit})`).join(', ');
    return { ok: false, platform, via: 'native', detail: `Too long for ${platform}: ${which}. Trim and retry.` };
  }
  try {
    switch (platform) {
      case 'ma':
        return await postMastodon(blocks, conn, images);
      case 'bs':
        return await postBluesky(blocks, conn, images);
      case 'x':
        return await postX(blocks, conn);
      case 'li':
        return await postLinkedIn(blocks, conn);
      case 'th':
        return await postThreads(blocks, conn);
      default:
        return fail(platform, `Native posting not supported for ${platform} yet — use Author only.`);
    }
  } catch (e: any) {
    return fail(platform, e.message || 'unexpected error');
  }
}

const UA = 'wiwo/1.0 (+https://github.com/maxpowerscomic-rgb/agentspace)';

// Resolve a served image path (/uploads/x.png) to bytes on disk.
async function readImage(url: string): Promise<Buffer | null> {
  try {
    const { default: path } = await import('path');
    const { fileURLToPath } = await import('url');
    const fs = await import('fs');
    const here = path.dirname(fileURLToPath(import.meta.url));
    const name = url.replace(/^\/uploads\//, '');
    const file = path.resolve(here, '../../uploads', name);
    return fs.existsSync(file) ? fs.readFileSync(file) : null;
  } catch {
    return null;
  }
}

function fail(platform: Platform, detail: string): PostResult {
  return { ok: false, platform, via: 'native', detail };
}

// ---------- Mastodon ----------
async function postMastodon(blocks: string[], conn: SavedConnection, images: string[]): Promise<PostResult> {
  if (!conn.instance || !conn.token) return fail('ma', 'Mastodon needs an instance URL and access token.');
  const base = conn.instance.replace(/\/$/, '');
  const posts: { ok: boolean; url?: string; error?: string }[] = [];
  let replyTo: string | undefined;
  let firstUrl: string | undefined;

  // Upload up to 4 images and attach to the first post.
  const mediaIds: string[] = [];
  for (const img of images.slice(0, 4)) {
    const bytes = await readImage(img);
    if (!bytes) continue;
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(bytes)], { type: 'image/png' }), 'shot.png');
    const mr = await fetch(`${base}/api/v2/media`, {
      method: 'POST',
      headers: { authorization: `Bearer ${conn.token}`, 'user-agent': UA },
      body: form,
    });
    if (mr.ok) { const m: any = await mr.json(); if (m.id) mediaIds.push(m.id); }
  }

  let first = true;
  for (const status of blocks) {
    const body: any = { status, in_reply_to_id: replyTo };
    if (first && mediaIds.length) body.media_ids = mediaIds;
    first = false;
    const res = await fetch(`${base}/api/v1/statuses`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${conn.token}`,
        'content-type': 'application/json',
        'user-agent': UA,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      posts.push({ ok: false, error: `HTTP ${res.status}` });
      return { ok: false, platform: 'ma', via: 'native', detail: `Mastodon rejected a post (${res.status})`, posts };
    }
    const data: any = await res.json();
    replyTo = data.id;
    firstUrl = firstUrl ?? data.url;
    posts.push({ ok: true, url: data.url });
  }
  return { ok: true, platform: 'ma', via: 'native', detail: `Posted ${posts.length} to Mastodon`, url: firstUrl, posts };
}

// ---------- Bluesky (AT Protocol) ----------
async function postBluesky(blocks: string[], conn: SavedConnection, images: string[]): Promise<PostResult> {
  if (!conn.handle || !conn.appPassword) return fail('bs', 'Bluesky needs a handle and app password.');
  const pds = 'https://bsky.social';

  const sessRes = await fetch(`${pds}/xrpc/com.atproto.server.createSession`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier: conn.handle, password: conn.appPassword }),
  });
  if (!sessRes.ok) return fail('bs', `Bluesky login failed (${sessRes.status}) — check handle / app password.`);
  const sess: any = await sessRes.json();
  const { accessJwt, did } = sess;

  // Upload up to 4 blobs for the first post's embed.
  const embedImages: any[] = [];
  for (const img of images.slice(0, 4)) {
    const bytes = await readImage(img);
    if (!bytes) continue;
    const br = await fetch(`${pds}/xrpc/com.atproto.repo.uploadBlob`, {
      method: 'POST',
      headers: { authorization: `Bearer ${accessJwt}`, 'content-type': 'image/png' },
      body: new Uint8Array(bytes),
    });
    if (br.ok) { const b: any = await br.json(); if (b.blob) embedImages.push({ alt: 'wiwo screenshot', image: b.blob }); }
  }

  const posts: { ok: boolean; url?: string; error?: string }[] = [];
  let root: { uri: string; cid: string } | undefined;
  let parent: { uri: string; cid: string } | undefined;
  let firstUrl: string | undefined;

  let first = true;
  for (const text of blocks) {
    const record: any = { $type: 'app.bsky.feed.post', text, createdAt: new Date().toISOString() };
    if (first && embedImages.length) record.embed = { $type: 'app.bsky.embed.images', images: embedImages };
    first = false;
    if (root && parent) record.reply = { root, parent };
    const res = await fetch(`${pds}/xrpc/com.atproto.repo.createRecord`, {
      method: 'POST',
      headers: { authorization: `Bearer ${accessJwt}`, 'content-type': 'application/json' },
      body: JSON.stringify({ repo: did, collection: 'app.bsky.feed.post', record }),
    });
    if (!res.ok) {
      posts.push({ ok: false, error: `HTTP ${res.status}` });
      return { ok: false, platform: 'bs', via: 'native', detail: `Bluesky rejected a post (${res.status})`, posts };
    }
    const data: any = await res.json(); // { uri, cid }
    const ref = { uri: data.uri, cid: data.cid };
    if (!root) root = ref;
    parent = ref;
    const rkey = String(data.uri).split('/').pop();
    const url = `https://bsky.app/profile/${conn.handle}/post/${rkey}`;
    firstUrl = firstUrl ?? url;
    posts.push({ ok: true, url });
  }
  return { ok: true, platform: 'bs', via: 'native', detail: `Posted ${posts.length} to Bluesky`, url: firstUrl, posts };
}

// ---------- X (Twitter API v2) ----------
async function postX(blocks: string[], conn: SavedConnection): Promise<PostResult> {
  if (!conn.token) return fail('x', 'X needs a user access token (OAuth 2.0) from your own app.');
  const posts: { ok: boolean; url?: string; error?: string }[] = [];
  let replyTo: string | undefined;
  let firstUrl: string | undefined;

  for (const text of blocks) {
    const body: any = { text };
    if (replyTo) body.reply = { in_reply_to_tweet_id: replyTo };
    const res = await fetch('https://api.twitter.com/2/tweets', {
      method: 'POST',
      headers: { authorization: `Bearer ${conn.token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      posts.push({ ok: false, error: `HTTP ${res.status}` });
      return { ok: false, platform: 'x', via: 'native', detail: `X rejected a post (${res.status}) — token may lack tweet.write or be expired`, posts };
    }
    const data: any = await res.json();
    const id = data?.data?.id;
    replyTo = id;
    const url = `https://x.com/${conn.handle || 'i'}/status/${id}`;
    firstUrl = firstUrl ?? url;
    posts.push({ ok: true, url });
  }
  return { ok: true, platform: 'x', via: 'native', detail: `Posted ${posts.length} to X`, url: firstUrl, posts };
}

// ---------- LinkedIn (single post; no native threading) ----------
async function postLinkedIn(blocks: string[], conn: SavedConnection): Promise<PostResult> {
  if (!conn.token || !conn.authorId) {
    return fail('li', 'LinkedIn needs an access token and your author id (urn:li:person:…) from your own app.');
  }
  const text = blocks.join('\n\n');
  const author = conn.authorId.startsWith('urn:') ? conn.authorId : `urn:li:person:${conn.authorId}`;
  const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${conn.token}`,
      'content-type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      author,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text },
          shareMediaCategory: 'NONE',
        },
      },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    }),
  });
  if (!res.ok) {
    return fail('li', `LinkedIn rejected the post (${res.status}) — token may be expired or lack w_member_social`);
  }
  const id = res.headers.get('x-restli-id') || '';
  return {
    ok: true,
    platform: 'li',
    via: 'native',
    detail: 'Posted to LinkedIn',
    url: id ? `https://www.linkedin.com/feed/update/${id}` : undefined,
    posts: [{ ok: true }],
  };
}

// ---------- Threads (Meta Graph API) ----------
// Two-step publish: create a media container, then publish it. Threads chains
// replies via reply_to_id. Needs a long-lived user token + the numeric user id.
async function postThreads(blocks: string[], conn: SavedConnection): Promise<PostResult> {
  if (!conn.token || !conn.authorId) {
    return fail('th', 'Threads needs a user access token and your Threads user id (from your own Meta app).');
  }
  const base = `https://graph.threads.net/v1.0/${conn.authorId}`;
  const posts: { ok: boolean; url?: string; error?: string }[] = [];
  let replyTo: string | undefined;
  let firstUrl: string | undefined;

  for (const text of blocks) {
    // 1) create container
    const createParams = new URLSearchParams({ media_type: 'TEXT', text, access_token: conn.token });
    if (replyTo) createParams.set('reply_to_id', replyTo);
    const cr = await fetch(`${base}/threads`, { method: 'POST', body: createParams });
    if (!cr.ok) { posts.push({ ok: false, error: `HTTP ${cr.status}` }); return { ok: false, platform: 'th', via: 'native', detail: `Threads container failed (${cr.status})`, posts }; }
    const container: any = await cr.json();
    // 2) publish
    const pubParams = new URLSearchParams({ creation_id: container.id, access_token: conn.token });
    const pr = await fetch(`${base}/threads_publish`, { method: 'POST', body: pubParams });
    if (!pr.ok) { posts.push({ ok: false, error: `HTTP ${pr.status}` }); return { ok: false, platform: 'th', via: 'native', detail: `Threads publish failed (${pr.status})`, posts }; }
    const published: any = await pr.json();
    replyTo = published.id;
    const url = `https://www.threads.net/@${conn.handle.replace(/^@/, '')}`;
    firstUrl = firstUrl ?? url;
    posts.push({ ok: true, url });
  }
  return { ok: true, platform: 'th', via: 'native', detail: `Posted ${posts.length} to Threads`, url: firstUrl, posts };
}
