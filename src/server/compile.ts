// Compiles the day's changes into a shareable thread (organized by project),
// and formats a thread for a given social platform.
import type { Change, Project, Thread, ThreadPost, Platform } from '../types.js';

const EMOJI = ['📓', '🔐', '🛠️', '⚡', '🎨', '🚀', '🧩', '📦'];

/** Build a thread from today's changes, grouped by project. */
export function compileThread(
  projects: Project[],
  changes: Change[],
  platform: Platform = 'x',
): Thread {
  const byProject = new Map<string, Change[]>();
  for (const c of changes) {
    if (!byProject.has(c.projectId)) byProject.set(c.projectId, []);
    byProject.get(c.projectId)!.push(c);
  }

  const posts: ThreadPost[] = [];
  let i = 0;
  for (const [projectId, list] of byProject) {
    const project = projects.find((p) => p.id === projectId);
    const name = project?.name ?? projectId;
    const emoji = EMOJI[i % EMOJI.length];
    const bullets = list
      .map((c) => `• ${c.summary}${c.userNote ? ` — ${c.userNote}` : ''}`)
      .join('\n');
    const images = list.flatMap((c) => [c.beforeImg, c.afterImg].filter(Boolean) as string[]);
    posts.push({
      projectId,
      projectName: name,
      emoji,
      pill: name.toLowerCase().includes('crm') ? 'crm' : name.toLowerCase().includes('wiwo') ? 'wiwo' : 'note',
      text: `${emoji} ${name}\n${bullets}`,
      images,
      alt: images.map((img) => `Screenshot: ${img}`),
    });
    i++;
  }

  const projectCount = byProject.size;
  const intro = `Today I worked across ${projectCount} project${projectCount === 1 ? '' : 's'} 🧵 here's what shipped ↓`;

  return {
    date: new Date().toISOString().slice(0, 10),
    intro,
    posts,
    hashtags: '#buildinpublic #devlog #indiehackers',
    platform,
  };
}

interface FormattedThread {
  platform: Platform;
  label: string;
  /** Ready-to-copy text blocks, one per post. */
  blocks: string[];
  /** A single copy-paste string. */
  combined: string;
}

/** Reshape a compiled thread to a target platform's format. */
export function formatThread(thread: Thread, platform: Platform): FormattedThread {
  const total = 1 + thread.posts.length;
  const numbered = platform !== 'li';
  const includeTags = platform !== 'th';

  const labels: Record<Platform, string> = {
    x: `X — numbered thread, ${total} posts`,
    li: `LinkedIn — single post + carousel`,
    th: `Threads — ${total} short posts`,
    ma: `Mastodon — thread, 500-char posts`,
    bs: `Bluesky — thread, 300-char posts`,
  };

  const blocks: string[] = [];
  const intro = numbered ? `1/${total} ${thread.intro}` : thread.intro;
  blocks.push(intro + (includeTags ? `\n\n${thread.hashtags}` : ''));

  thread.posts.forEach((p, idx) => {
    const head = numbered ? `${idx + 2}/${total} ` : '';
    blocks.push(head + p.text);
  });

  const combined =
    platform === 'li'
      ? [thread.intro, ...thread.posts.map((p) => p.text), thread.hashtags].join('\n\n')
      : blocks.join('\n\n———\n\n');

  return { platform, label: labels[platform], blocks, combined };
}
