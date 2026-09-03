// Shared types for wiwo — used by both the server and the React app.

export type BuildStatus = 'passing' | 'failing' | 'building' | 'unknown';

export interface Project {
  id: string;
  name: string;
  repoPath: string;
  /** Optional path to a Claude Code session transcript (JSONL). */
  sessionPath?: string;
  /** Command run to determine build status, e.g. "npm test". */
  buildCmd?: string;
  buildStatus: BuildStatus;
  /** URL of the running app, for Playwright before/after screenshots (Phase 2). */
  appUrl?: string;
  /** Command that builds+serves the app on $PORT — enables true before/after
   *  by rendering a past commit in a throwaway git worktree. */
  serveCmd?: string;
  /** Last paragraph of the project's chat, or its most recent prompt. */
  latestContext: string;
  lastActive?: string; // ISO timestamp
  createdAt: string;
  /** Auto-scan on new commits when true (Phase 2 file watcher). */
  autoScan?: boolean;
  /** Persisted Claude Code session id, so prompts continue the same conversation (Phase 4). */
  claudeSessionId?: string;
  /** After a commit lands, query the agent for a sharper summary (Phase 4). */
  enrich?: boolean;
}

export interface Change {
  id: string;
  projectId: string;
  timestamp: string; // ISO
  summary: string;
  filesTouched: string[];
  commitHash?: string;
  /** Diff stat for the rendered before/after card (Phase 1). */
  diff?: { added: number; removed: number; sample: string };
  beforeImg?: string;
  afterImg?: string;
  userNote?: string;
  buildStatus: BuildStatus;
}

export interface ThreadPost {
  projectId?: string;
  projectName?: string;
  pill?: 'note' | 'crm' | 'wiwo' | string;
  emoji?: string;
  text: string;
  images: string[];
  alt: string[];
}

export interface Thread {
  date: string; // YYYY-MM-DD
  intro: string;
  posts: ThreadPost[];
  hashtags: string;
  platform: Platform;
}

export type Platform = 'x' | 'li' | 'th' | 'ma' | 'bs';

/** How a thread is delivered: author only (copy/export) or posted natively. */
export type PostMode = 'author' | 'native';

/** A persisted thread the user has edited and/or scheduled (Phase 2/3). */
export interface SavedThread {
  id: string;
  thread: Thread;
  createdAt: string;
  updatedAt: string;
  /** ISO time to post at; undefined = not scheduled. */
  scheduledFor?: string;
  status: 'draft' | 'scheduled' | 'posted';
  postedAt?: string;
  /** Delivery mode (default 'author'). */
  mode?: PostMode;
  /** Result of the last post attempt. */
  lastResult?: PostResult;
}

/** Stored credentials + status for a connected platform account. */
export interface SavedConnection {
  /** Stable id — supports multiple accounts per platform. */
  id: string;
  platform: Platform;
  /** Display name, e.g. "@maya@fosstodon.org" or "maya.bsky.social". */
  handle: string;
  /** Mastodon instance base URL (Mastodon only). */
  instance?: string;
  /** Bearer token / access token (Mastodon, X, LinkedIn, Threads). Encrypted at rest. */
  token?: string;
  /** Bluesky app password. Encrypted at rest. */
  appPassword?: string;
  /** OAuth refresh token (X, LinkedIn). Encrypted at rest. */
  refreshToken?: string;
  /** ISO expiry of the access token, when known. */
  expiresAt?: string;
  /** LinkedIn/X/Threads author id/urn when required. */
  authorId?: string;
  /** The account used by default for this platform. */
  isDefault?: boolean;
  connectedAt: string;
}

/** Outcome of posting a thread to one platform. */
export interface PostResult {
  ok: boolean;
  platform: Platform;
  via: 'native' | 'webhook' | 'manual';
  detail: string;
  /** Permalink of the posted thread's first post, when available. */
  url?: string;
  /** Per-post outcomes (native threaded posting). */
  posts?: { ok: boolean; url?: string; error?: string }[];
}

// ---- v2: focus sessions ("log and keep going") ----

/** A thing to work on. Belongs to one project; drives focus sessions. */
export interface Task {
  id: string;
  projectId: string;
  title: string;
  /** Minutes per sprint before wiwo checks in. */
  intervalMin: number;
  createdAt: string;
  status: 'active' | 'done';
}

/** One work interval within a session. The atomic unit of v2. */
export interface Sprint {
  id: string;
  index: number; // 1-based within the session
  startedAt: string;
  endedAt?: string;
  /** What the user logged (typed, or pulled from the changelog). */
  line: string;
  /** True if `line` was filled from detected commits rather than typed. */
  auto: boolean;
  /** If the user attributed this sprint to a different project. */
  altProjectId?: string;
  /** Commit hashes detected during this sprint (informational). */
  commits: string[];
  /** The user skipped logging this sprint. */
  skipped?: boolean;
  /** Result of publishing this sprint on its own, if posted. */
  postResult?: PostResult;
}

/** A run of sprints against one task. */
export interface Session {
  id: string;
  taskId: string;
  projectId: string;
  title: string;
  intervalMin: number;
  startedAt: string;
  endedAt?: string;
  /** ISO time the current sprint's check-in is due (server-side timer). */
  checkinDueAt?: string;
  status: 'running' | 'awaiting-checkin' | 'ended';
  sprints: Sprint[];
}

export interface WiwoData {
  projects: Project[];
  changes: Change[];
  threads?: SavedThread[];
  connections?: SavedConnection[];
  tasks?: Task[];
  sessions?: Session[];
  /** Web Push subscriptions (PWA notifications). */
  pushSubs?: PushSub[];
}

/** A stored Web Push subscription (browser PushManager JSON). */
export interface PushSub {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  createdAt: string;
}
