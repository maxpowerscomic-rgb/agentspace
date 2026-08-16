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
  /** Last paragraph of the project's chat, or its most recent prompt. */
  latestContext: string;
  lastActive?: string; // ISO timestamp
  createdAt: string;
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

export type Platform = 'x' | 'li' | 'th' | 'ma';

export interface WiwoData {
  projects: Project[];
  changes: Change[];
}
