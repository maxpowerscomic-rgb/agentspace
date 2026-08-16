import { useEffect, useState, useCallback, type FC } from 'react';
import { api, type Formatted } from './api';
import type { Project, Change, Thread, Platform } from './types';

type View = 'dash' | 'log' | 'thread';
type P = Project & { todayCount?: number };

const SendIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" />
  </svg>
);
const PencilIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
  </svg>
);

function statusClass(s: string) {
  return s === 'passing' ? 'pass' : s === 'failing' ? 'fail' : s === 'building' ? 'build' : 'unknown';
}
function statusLabel(s: string) {
  return s === 'passing' ? 'passing' : s === 'failing' ? 'failing' : s === 'building' ? 'building' : 'no build';
}
function timeOf(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function ago(iso?: string) {
  if (!iso) return '';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export default function App() {
  const [view, setView] = useState<View>('dash');
  const [projects, setProjects] = useState<P[]>([]);
  const [showAdd, setShowAdd] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setProjects(await api.listProjects());
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const greeting = (() => {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  })();
  const today = new Date().toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <div className="app">
      <aside>
        <div className="logo">
          <div className="mark"><span>w</span></div>
          <div className="name"><em>wiwo</em></div>
        </div>
        <div className="navlist" role="tablist" aria-label="Views">
          <button role="tab" aria-selected={view === 'dash'} onClick={() => setView('dash')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>
            Dashboard
          </button>
          <button role="tab" aria-selected={view === 'log'} onClick={() => setView('log')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 8v4l3 2" /><circle cx="12" cy="12" r="9" /></svg>
            Daily Log
          </button>
          <button role="tab" aria-selected={view === 'thread'} onClick={() => setView('thread')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
            wiwo Thread
          </button>
        </div>
        <div>
          <div className="rail-label">Projects</div>
          <div className="projlist">
            {projects.map((p) => (
              <a key={p.id} onClick={() => setView('dash')}>
                <span className="d" style={{ background: `var(--${statusClass(p.buildStatus)})` }} />
                <span className="nm">{p.name}</span>
                <span className="n">{p.todayCount ?? 0}</span>
              </a>
            ))}
            {projects.length === 0 && <span className="muted" style={{ padding: '4px 11px' }}>None yet</span>}
          </div>
        </div>
        <div className="me">
          <div className="pfp">D</div>
          <div className="who"><b>You</b><span>local workspace</span></div>
        </div>
      </aside>

      <main>
        {view === 'dash' && (
          <Dashboard
            greeting={greeting}
            today={today}
            projects={projects}
            onAdd={() => setShowAdd(true)}
            onChange={refresh}
          />
        )}
        {view === 'log' && <DailyLog onCompile={() => setView('thread')} />}
        {view === 'thread' && <ThreadView />}
      </main>

      {showAdd && <AddProjectModal onClose={() => setShowAdd(false)} onAdded={() => { setShowAdd(false); refresh(); }} />}
    </div>
  );
}

function Dashboard({ greeting, today, projects, onAdd, onChange }: {
  greeting: string; today: string; projects: P[]; onAdd: () => void; onChange: () => void;
}) {
  return (
    <>
      <div className="head">
        <span className="day">{today}</span>
        <h1>{greeting} 👋</h1>
        <p>Where everything stands. Message any project to pick up where you left off — wiwo keeps logging in the background.</p>
        <div style={{ marginTop: 14 }}><button className="btn-add" onClick={onAdd}>+ Add project</button></div>
      </div>
      {projects.length === 0 ? (
        <div className="empty">
          <h3>No projects yet</h3>
          <p className="muted">Add a local git repo to start auto-logging your progress.</p>
        </div>
      ) : (
        <div className="cards">
          {projects.map((p) => <ProjectCard key={p.id} p={p} onChange={onChange} />)}
        </div>
      )}
    </>
  );
}

const ProjectCard: FC<{ p: P; onChange: () => void }> = ({ p, onChange }) => {
  const [text, setText] = useState(p.latestContext && p.buildStatus === 'failing' ? '' : '');
  const [sent, setSent] = useState('');
  const [busy, setBusy] = useState('');

  const send = async () => {
    if (!text.trim()) return;
    const r = await api.prompt(p.id, text.trim());
    setText('');
    setSent(r.note);
    onChange();
  };
  const scan = async () => {
    setBusy('Scanning…');
    try {
      const r = await api.scan(p.id);
      setBusy(`+${r.added.length} change${r.added.length === 1 ? '' : 's'}`);
    } catch (e: any) { setBusy(e.message); }
    onChange();
    setTimeout(() => setBusy(''), 2500);
  };
  const build = async () => {
    setBusy('Building…');
    try {
      const r = await api.build(p.id);
      setBusy(`build ${r.status}`);
    } catch (e: any) { setBusy(e.message); }
    onChange();
    setTimeout(() => setBusy(''), 2500);
  };
  const remove = async () => {
    if (!confirm(`Remove ${p.name} from wiwo? (your repo is untouched)`)) return;
    await api.deleteProject(p.id);
    onChange();
  };

  return (
    <div className="card">
      <div className="crow">
        <span className="d" style={{ background: `var(--${statusClass(p.buildStatus)})` }} />
        <h3>{p.name}</h3>
        <span className={`pill ${statusClass(p.buildStatus)}`}>
          {p.buildStatus === 'building' && <span className="p" />}{statusLabel(p.buildStatus)}
        </span>
        <button className="x" title="Remove" onClick={remove}>×</button>
      </div>
      <div className="ctx"><span className="lab">Last chat</span>{p.latestContext}</div>
      <div className="stat">
        <span>{p.todayCount ?? 0} change{(p.todayCount ?? 0) === 1 ? '' : 's'} today</span>
        {p.lastActive && <span>· active {ago(p.lastActive)}</span>}
      </div>
      <div className="ask">
        <input placeholder={`Message ${p.name}…`} value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()} aria-label={`Message ${p.name}`} />
        <button aria-label="Send" onClick={send}><SendIcon /></button>
      </div>
      {sent && <div className="sent">✓ {sent}</div>}
      <div className="card-actions">
        <button onClick={scan}>Scan git + chat</button>
        <button onClick={build} disabled={!p.buildCmd} title={p.buildCmd ? p.buildCmd : 'no build command set'}>Run build</button>
      </div>
      {busy && <div className="muted" style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{busy}</div>}
    </div>
  );
};

function DailyLog({ onCompile }: { onCompile: () => void }) {
  const [changes, setChanges] = useState<Change[]>([]);
  const [projMap, setProjMap] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const [{ changes }, projects] = await Promise.all([api.log(), api.listProjects()]);
    setChanges(changes);
    setProjMap(Object.fromEntries(projects.map((p) => [p.id, p.name])));
  }, []);
  useEffect(() => { load(); }, [load]);

  const saveNote = async (id: string, note: string) => {
    await api.updateChange(id, { userNote: note });
  };

  return (
    <>
      <div className="head">
        <span className="day">{changes.length} change{changes.length === 1 ? '' : 's'}</span>
        <h1>Today's log</h1>
        <p>Captured automatically from your commits and chats. Add a one-line story where a change deserves one — leave the rest to wiwo.</p>
      </div>
      {changes.length === 0 ? (
        <div className="empty">
          <h3>Nothing logged today</h3>
          <p className="muted">Commit some work, then hit “Scan git + chat” on a project card.</p>
        </div>
      ) : (
        <>
          <div className="tl">
            {changes.map((c) => (
              <LogEntry key={c.id} c={c} project={projMap[c.projectId] ?? 'project'} onSaveNote={saveNote} />
            ))}
          </div>
          <div className="compile">
            <div>
              <b>{changes.length} change{changes.length === 1 ? '' : 's'} today.</b>
              <span>Ready to share? wiwo will write the thread — copy, images and metadata included.</span>
            </div>
            <button onClick={onCompile}>Compile thread →</button>
          </div>
        </>
      )}
    </>
  );
}

const LogEntry: FC<{ c: Change; project: string; onSaveNote: (id: string, note: string) => void }> = ({ c, project, onSaveNote }) => {
  const [note, setNote] = useState(c.userNote ?? '');
  const [saved, setSaved] = useState(!!c.userNote);
  const cls = c.buildStatus === 'failing' ? 'fail' : c.buildStatus === 'building' ? 'build' : '';
  return (
    <div className={`ev ${cls}`}>
      <div className="evc">
        <div className="evh">
          <time>{timeOf(c.timestamp)}</time>
          <span className="tagp">{project}</span>
          <span className="sum">{c.summary}</span>
          {c.diff && (
            <span className="diffstat"><span className="add">+{c.diff.added}</span> <span className="rem">−{c.diff.removed}</span></span>
          )}
        </div>
        <div className="ba">
          <figure><figcaption>before</figcaption>
            <div className="shot before">{c.beforeImg ? <img src={c.beforeImg} alt="before" /> : `${c.commitHash?.slice(0, 7) ?? 'prev'} · diff`}</div>
          </figure>
          <figure><figcaption>after</figcaption>
            <div className="shot after">{c.afterImg ? <img src={c.afterImg} alt="after" /> : `${c.filesTouched.length} file${c.filesTouched.length === 1 ? '' : 's'}`}</div>
          </figure>
        </div>
        <div className="note">
          <span className="ic"><PencilIcon /></span>
          <input placeholder="Add a one-line story (optional)…" value={note}
            onChange={(e) => { setNote(e.target.value); setSaved(false); }}
            onBlur={() => { onSaveNote(c.id, note); setSaved(true); }} />
          <span className="badge">{saved && note ? 'saved' : 'optional'}</span>
        </div>
      </div>
    </div>
  );
};

const PLATFORMS: { id: Platform; label: string }[] = [
  { id: 'x', label: 'X' }, { id: 'li', label: 'LinkedIn' }, { id: 'th', label: 'Threads' }, { id: 'ma', label: 'Mastodon' },
];

function ThreadView() {
  const [platform, setPlatform] = useState<Platform>('x');
  const [thread, setThread] = useState<Thread | null>(null);
  const [fmt, setFmt] = useState<Formatted | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.compile('x').then((r) => { setThread(r.thread); setFmt(r.formatted); });
  }, []);

  const pick = async (pl: Platform) => {
    setPlatform(pl);
    if (!thread) return;
    const r = await api.export(thread, pl);
    setFmt(r.formatted);
  };

  const copy = async () => {
    if (!fmt) return;
    try { await navigator.clipboard.writeText(fmt.combined); } catch { /* clipboard blocked */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  if (!thread) return <div className="empty"><h3>Nothing to compile yet</h3><p className="muted">Log some changes today, then come back.</p></div>;
  if (thread.posts.length === 0) return (
    <>
      <div className="head"><h1>Your wiwo thread</h1><p>No changes logged today — nothing to compile yet.</p></div>
    </>
  );

  const total = 1 + thread.posts.length;
  const numbered = platform !== 'li';

  return (
    <>
      <div className="head">
        <h1>Your wiwo thread</h1>
        <p>Written for you, organized by project. Click any line to edit. Pick where it's going and wiwo reshapes it to fit.</p>
      </div>
      <div className="thead">
        <div className="segs" role="tablist" aria-label="Platform">
          {PLATFORMS.map((pl) => (
            <button key={pl.id} role="tab" aria-selected={platform === pl.id} onClick={() => pick(pl.id)}>{pl.label}</button>
          ))}
        </div>
      </div>
      <div className="thread">
        <div className="post">
          <div className="av">D</div>
          <div className="pb">
            <div className="ph"><span className="nm">You</span><span className="hd">@you</span><span className="ix">{numbered ? `1/${total}` : ''}</span></div>
            <div className="pt" contentEditable suppressContentEditableWarning>{thread.intro}</div>
            <div className="mt"><span className="h">{thread.hashtags}</span></div>
          </div>
        </div>
        {thread.posts.map((p, i) => (
          <div className="post" key={i}>
            <div className="av">D</div>
            <div className="pb">
              <div className="ph"><span className="nm">You</span><span className="hd">@you</span><span className="ix">{numbered ? `${i + 2}/${total}` : ''}</span></div>
              <div className="pt" contentEditable suppressContentEditableWarning>{p.text}</div>
              <div className="mt">alt-text auto-written · {p.images.length} image{p.images.length === 1 ? '' : 's'}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="exp">
        <div className="f">Format: <b>{fmt?.label}</b></div>
        <button onClick={copy}>{copied ? '✓ Copied' : 'Export ↗'}</button>
      </div>
      <div className="foot">source: Claude Code session + git · edits are illustrative in this build</div>
    </>
  );
}

function AddProjectModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [name, setName] = useState('');
  const [repoPath, setRepoPath] = useState('');
  const [buildCmd, setBuildCmd] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setErr(''); setBusy(true);
    try {
      await api.addProject({ name: name.trim(), repoPath: repoPath.trim(), buildCmd: buildCmd.trim() || undefined });
      onAdded();
    } catch (e: any) { setErr(e.message); setBusy(false); }
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Add a project</h2>
        <p>Point wiwo at a local git repo. It reads git history and the matching Claude Code session — read-only.</p>
        <div className="field">
          <label>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="notebook-app" autoFocus />
        </div>
        <div className="field">
          <label>Repo path</label>
          <input value={repoPath} onChange={(e) => setRepoPath(e.target.value)} placeholder="/home/you/code/notebook-app" />
          <span className="hint">absolute path to a local git repository</span>
        </div>
        <div className="field">
          <label>Build command <span style={{ color: 'var(--ink-3)', fontWeight: 400 }}>(optional)</span></label>
          <input value={buildCmd} onChange={(e) => setBuildCmd(e.target.value)} placeholder="npm test" />
          <span className="hint">run to derive 🟢/🔴 build status</span>
        </div>
        {err && <div className="err">{err}</div>}
        <div className="modal-actions">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-add" onClick={submit} disabled={busy || !name.trim() || !repoPath.trim()}>
            {busy ? 'Adding…' : 'Add project'}
          </button>
        </div>
      </div>
    </div>
  );
}
