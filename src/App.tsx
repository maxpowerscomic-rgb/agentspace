import { useEffect, useState, useCallback, type FC } from 'react';
import { api, CHAR_LIMITS, type Formatted, type Digest, type Connection } from './api';
import type { Project, Change, Thread, Platform, PostMode, SavedThread } from './types';

type View = 'dash' | 'log' | 'thread' | 'digest' | 'connect' | 'history';
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
  const [streak, setStreak] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const [toast, setToast] = useState('');
  const [injected, setInjected] = useState<Thread | null>(null);

  const openThread = (t: Thread | null) => { setInjected(t); setView('thread'); };

  const refresh = useCallback(async () => {
    try {
      setProjects(await api.listProjects());
      setStreak((await api.digest()).streak);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Live auto-scan: refresh when the watcher logs a new commit's changes.
  useEffect(() => {
    const es = new EventSource('/api/events');
    es.addEventListener('scanned', (ev) => {
      try {
        const d = JSON.parse((ev as MessageEvent).data);
        setToast(`Auto-logged ${d.added?.length ?? 0} change${d.added?.length === 1 ? '' : 's'}`);
        setTimeout(() => setToast(''), 3000);
      } catch { /* ignore */ }
      refresh();
    });
    return () => es.close();
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
          <button role="tab" aria-selected={view === 'digest'} onClick={() => setView('digest')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M3 3v18h18" /><path d="M7 14l3-4 4 3 4-6" /></svg>
            Weekly digest
          </button>
          <button role="tab" aria-selected={view === 'history'} onClick={() => setView('history')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M4 6h16M4 12h16M4 18h10" /></svg>
            Drafts &amp; scheduled
          </button>
          <button role="tab" aria-selected={view === 'connect'} onClick={() => setView('connect')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M9 12a3 3 0 0 0 3 3l3-3a3 3 0 0 0-4.2-4.2l-.9.9" /><path d="M15 12a3 3 0 0 0-3-3l-3 3a3 3 0 0 0 4.2 4.2l.9-.9" /></svg>
            Connections
          </button>
        </div>
        {streak > 0 && (
          <div className="streak" title="Consecutive days shipping">🔥 {streak}-day streak</div>
        )}
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
            onRetro={openThread}
          />
        )}
        {view === 'log' && <DailyLog onCompile={() => openThread(null)} />}
        {view === 'thread' && <ThreadView onManage={() => setView('connect')} initial={injected} />}
        {view === 'digest' && <DigestView />}
        {view === 'connect' && <ConnectionsView />}
        {view === 'history' && <HistoryView />}
      </main>

      {showAdd && <AddProjectModal onClose={() => setShowAdd(false)} onAdded={() => { setShowAdd(false); refresh(); }} />}
      {toast && <div className="toast">✦ {toast}</div>}
    </div>
  );
}

function DigestView() {
  const [d, setD] = useState<Digest | null>(null);
  useEffect(() => { api.digest().then(setD); }, []);
  if (!d) return <div className="empty"><h3>Loading…</h3></div>;
  return (
    <>
      <div className="head">
        <span className="day">{d.from} → {d.to}</span>
        <h1>This week 🔥 {d.streak}-day streak</h1>
        <p>{d.headline}</p>
      </div>
      <div className="cards">
        <div className="card"><div className="ctx"><span className="lab">Total changes</span><b style={{ fontSize: 28 }}>{d.totalChanges}</b></div></div>
        <div className="card"><div className="ctx"><span className="lab">Active days</span><b style={{ fontSize: 28 }}>{d.activeDays}<span className="muted"> / 7</span></b></div></div>
        <div className="card"><div className="ctx"><span className="lab">Current streak</span><b style={{ fontSize: 28 }}>{d.streak} 🔥</b></div></div>
      </div>
      <div style={{ marginTop: 20 }}>
        {d.byProject.length === 0 && <p className="muted">Nothing logged in the last 7 days.</p>}
        {d.byProject.map((p) => (
          <div className="evc" key={p.projectId} style={{ marginBottom: 12 }}>
            <div className="evh"><span className="sum">{p.name}</span><span className="diffstat">{p.count} change{p.count === 1 ? '' : 's'}</span></div>
            <div style={{ padding: '0 16px 14px' }}>
              {p.summaries.map((s, i) => <div key={i} className="muted" style={{ fontSize: 13.5, padding: '2px 0' }}>• {s}</div>)}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function Dashboard({ greeting, today, projects, onAdd, onChange, onRetro }: {
  greeting: string; today: string; projects: P[]; onAdd: () => void; onChange: () => void; onRetro: (t: Thread) => void;
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
          {projects.map((p) => <ProjectCard key={p.id} p={p} onChange={onChange} onRetro={onRetro} />)}
        </div>
      )}
    </>
  );
}

const ProjectCard: FC<{ p: P; onChange: () => void; onRetro: (t: Thread) => void }> = ({ p, onChange, onRetro }) => {
  const [showRetro, setShowRetro] = useState(false);
  const [text, setText] = useState('');
  const [sent, setSent] = useState('');
  const [reply, setReply] = useState('');
  const [working, setWorking] = useState(false);
  const [busy, setBusy] = useState('');

  const send = async () => {
    if (!text.trim() || working) return;
    const prompt = text.trim();
    setText('');
    setReply('');
    setWorking(true);
    setSent(`→ working in ${p.name}…`);
    try {
      const r = await api.promptStream(p.id, prompt, (chunk) => setReply((prev) => prev + chunk));
      if (r.live) {
        setSent('✓ agent finished');
        setReply((prev) => prev || r.reply || '(done — no text reply)');
      } else {
        setSent(r.note || 'Prompt recorded (live session control unavailable)');
      }
    } catch (e: any) {
      setSent(e.message);
    } finally {
      setWorking(false);
      onChange();
    }
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
  const snapshot = async () => {
    setBusy('Capturing…');
    try {
      await api.screenshot(p.id);
      setBusy('📸 snapshot attached');
    } catch (e: any) { setBusy(e.message); }
    onChange();
    setTimeout(() => setBusy(''), 2500);
  };
  const toggleAuto = async () => {
    await api.patchProject(p.id, { autoScan: !p.autoScan });
    onChange();
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
      <button className={`auto ${p.autoScan ? 'on' : ''}`} onClick={toggleAuto}
        title="Auto-log new commits as they land">
        <span className="dot" /> Auto-scan {p.autoScan ? 'on' : 'off'}
      </button>
      <div className="ctx"><span className="lab">Last chat</span>{p.latestContext}</div>
      <div className="stat">
        <span>{p.todayCount ?? 0} change{(p.todayCount ?? 0) === 1 ? '' : 's'} today</span>
        {p.lastActive && <span>· active {ago(p.lastActive)}</span>}
      </div>
      <div className="ask">
        <input placeholder={working ? 'agent is working…' : `Message ${p.name}…`} value={text} disabled={working}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()} aria-label={`Message ${p.name}`} />
        <button aria-label="Send" onClick={send} disabled={working}><SendIcon /></button>
      </div>
      {sent && <div className="sent">{sent}</div>}
      {reply && <div className="reply">{reply}</div>}
      <div className="card-actions">
        <button onClick={scan}>Scan git + chat</button>
        <button onClick={build} disabled={!p.buildCmd} title={p.buildCmd ? p.buildCmd : 'no build command set'}>Run build</button>
        <button onClick={snapshot} disabled={!p.appUrl} title={p.appUrl ? `screenshot ${p.appUrl}` : 'set an app URL to enable'}>Snapshot</button>
        <button onClick={() => setShowRetro(true)} title="Build a thread from this project's whole history">Retro</button>
      </div>
      {busy && <div className="muted" style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{busy}</div>}
      {showRetro && <RetroModal p={p} onClose={() => setShowRetro(false)} onBuilt={(t) => { setShowRetro(false); onRetro(t); }} />}
    </div>
  );
};

const RetroModal: FC<{ p: P; onClose: () => void; onBuilt: (t: Thread) => void }> = ({ p, onClose, onBuilt }) => {
  const [window, setWindow] = useState<'day' | 'week' | 'month'>('week');
  const [since, setSince] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const build = async () => {
    setErr(''); setBusy(true);
    try {
      const r = await api.retro(p.id, window, { since: since || undefined });
      if (r.empty || !r.thread) { setErr('No commits found in that range.'); setBusy(false); return; }
      onBuilt(r.thread);
    } catch (e: any) { setErr(e.message); setBusy(false); }
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Retrospective thread</h2>
        <p>Turn <b>{p.name}</b>'s whole git history into a thread — one post per time window.</p>
        <div className="field">
          <label>Group by</label>
          <div className="modeswitch" style={{ width: 'fit-content' }}>
            {(['day', 'week', 'month'] as const).map((w) => (
              <button key={w} aria-selected={window === w} onClick={() => setWindow(w)}>{w}</button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>Since <span style={{ color: 'var(--ink-3)', fontWeight: 400 }}>(optional)</span></label>
          <input type="date" value={since} onChange={(e) => setSince(e.target.value)} />
          <span className="hint">leave blank for the entire history</span>
        </div>
        {err && <div className="err">{err}</div>}
        <div className="modal-actions">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-add" onClick={build} disabled={busy}>{busy ? 'Building…' : 'Build thread →'}</button>
        </div>
      </div>
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
  { id: 'x', label: 'X' }, { id: 'li', label: 'LinkedIn' }, { id: 'th', label: 'Threads' },
  { id: 'ma', label: 'Mastodon' }, { id: 'bs', label: 'Bluesky' },
];

function ThreadView({ onManage, initial }: { onManage: () => void; initial?: Thread | null }) {
  const [platform, setPlatform] = useState<Platform>('x');
  const [thread, setThread] = useState<Thread | null>(null);
  const [fmt, setFmt] = useState<Formatted | null>(null);
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState('');
  const [mode, setMode] = useState<PostMode>('author');
  const [conns, setConns] = useState<Connection[]>([]);
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    if (initial) {
      // A retrospective (or other) thread was handed in — use it directly.
      setThread(initial);
      api.export(initial, 'x').then((r) => setFmt(r.formatted));
    } else {
      api.compile('x').then((r) => { setThread(r.thread); setFmt(r.formatted); });
    }
    api.connections().then(setConns);
  }, [initial]);

  const connected = conns.some((c) => c.platform === platform);

  const pick = async (pl: Platform) => {
    setPlatform(pl);
    if (!thread) return;
    const r = await api.export({ ...thread, platform: pl }, pl);
    setFmt(r.formatted);
  };

  // Persist an inline edit into the working thread copy (editable metadata).
  const editIntro = (text: string) => thread && setThread({ ...thread, intro: text });
  const editPost = (i: number, text: string) => {
    if (!thread) return;
    const posts = thread.posts.map((p, idx) => (idx === i ? { ...p, text } : p));
    setThread({ ...thread, posts });
  };
  const editTags = (text: string) => thread && setThread({ ...thread, hashtags: text });

  const copy = async () => {
    if (!thread) return;
    const r = await api.export({ ...thread, platform }, platform);
    try { await navigator.clipboard.writeText(r.formatted.combined); } catch { /* clipboard blocked */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const saveDraft = async () => {
    if (!thread) return;
    await api.saveThread({ ...thread, platform }, { mode });
    setStatus('Saved as draft');
    setTimeout(() => setStatus(''), 2500);
  };

  const schedule = async () => {
    if (!thread) return;
    const when = prompt('Schedule for (YYYY-MM-DD HH:MM, local time):');
    if (!when) return;
    const iso = new Date(when.replace(' ', 'T')).toISOString();
    await api.saveThread({ ...thread, platform }, { scheduledFor: iso, mode });
    setStatus(`Scheduled (${mode === 'native' ? 'native post' : 'author only'}) for ${new Date(iso).toLocaleString()}`);
    setTimeout(() => setStatus(''), 4000);
  };

  const postNow = async () => {
    if (!thread) return;
    setPosting(true);
    setStatus('');
    try {
      const saved = await api.saveThread({ ...thread, platform }, { mode });
      const r = await api.postThread(saved.id);
      if (r.ok && r.url) setStatus(`✓ ${r.detail} → ${r.url}`);
      else setStatus(`${r.ok ? '✓' : '⚠'} ${r.detail}`);
    } catch (e: any) {
      setStatus(e.message);
    } finally {
      setPosting(false);
      setTimeout(() => setStatus(''), 6000);
    }
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
        <div className="modeswitch" role="tablist" aria-label="Delivery mode">
          <button role="tab" aria-selected={mode === 'author'} onClick={() => setMode('author')}>✍️ Author only</button>
          <button role="tab" aria-selected={mode === 'native'} onClick={() => setMode('native')}>🚀 Post natively</button>
        </div>
        <div className="segs" role="tablist" aria-label="Platform">
          {PLATFORMS.map((pl) => (
            <button key={pl.id} role="tab" aria-selected={platform === pl.id} onClick={() => pick(pl.id)}>{pl.label}</button>
          ))}
        </div>
      </div>
      {mode === 'native' && (
        <div className={`connbar ${connected ? 'ok' : 'warn'}`}>
          {connected
            ? <span>✓ Connected — wiwo will post this thread to your {PLATFORMS.find((p) => p.id === platform)?.label} account.</span>
            : <span>No {PLATFORMS.find((p) => p.id === platform)?.label} account connected. <button className="link" onClick={onManage}>Connect one →</button> or switch to Author only.</span>}
        </div>
      )}
      <div className="thread">
        <div className="post">
          <div className="av">D</div>
          <div className="pb">
            <div className="ph"><span className="nm">You</span><span className="hd">@you</span><span className="ix">{numbered ? `1/${total}` : ''}</span></div>
            <div className="pt" contentEditable suppressContentEditableWarning
              onBlur={(e) => editIntro(e.currentTarget.textContent ?? '')}>{thread.intro}</div>
            <div className="pt" contentEditable suppressContentEditableWarning style={{ color: 'var(--brand)', fontSize: 13, marginTop: 6 }}
              onBlur={(e) => editTags(e.currentTarget.textContent ?? '')}>{thread.hashtags}</div>
          </div>
        </div>
        {thread.posts.map((p, i) => (
          <div className="post" key={i}>
            <div className="av">D</div>
            <div className="pb">
              <div className="ph"><span className="nm">You</span><span className="hd">@you</span><span className="ix">{numbered ? `${i + 2}/${total}` : ''}</span></div>
              <div className="pt" contentEditable suppressContentEditableWarning
                onBlur={(e) => editPost(i, e.currentTarget.textContent ?? '')}>{p.text}</div>
              <div className="mt">
                <span style={{ color: [...p.text].length > CHAR_LIMITS[platform] ? 'var(--fail)' : 'var(--ink-3)' }}>
                  {[...p.text].length}/{CHAR_LIMITS[platform]}
                </span>
                {' · '}alt-text auto-written · {p.images.length} image{p.images.length === 1 ? '' : 's'}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="exp">
        <div className="f">Format: <b>{fmt?.label}</b></div>
        <button className="btn-ghost" onClick={saveDraft}>Save draft</button>
        <button className="btn-ghost" onClick={schedule}>Schedule…</button>
        {mode === 'author'
          ? <button onClick={copy}>{copied ? '✓ Copied' : `Copy for ${PLATFORMS.find((p) => p.id === platform)?.label}`}</button>
          : <button onClick={postNow} disabled={posting || !connected}>{posting ? 'Posting…' : `Post to ${PLATFORMS.find((p) => p.id === platform)?.label}`}</button>}
      </div>
      {status && <div className="sent" style={{ marginTop: 10, wordBreak: 'break-all' }}>{status}</div>}
      <div className="foot">
        {mode === 'author'
          ? 'Author only — wiwo writes it, you post it. Nothing is sent anywhere.'
          : 'Native — wiwo posts to your connected account and returns the link.'}
      </div>
    </>
  );
}

const CONN_META: Record<Platform, { label: string; note: string; fields: ('handle' | 'instance' | 'token' | 'appPassword' | 'authorId')[] }> = {
  ma: { label: 'Mastodon', note: 'One-click OAuth (just your instance), or paste an access token (scope write:statuses).', fields: ['instance', 'handle', 'token'] },
  bs: { label: 'Bluesky', note: 'Handle + app password (Settings → App Passwords). No OAuth app needed.', fields: ['handle', 'appPassword'] },
  x: { label: 'X', note: 'OAuth if you set WIWO_X_CLIENT_ID, otherwise paste a user token with tweet.write.', fields: ['handle', 'token'] },
  li: { label: 'LinkedIn', note: 'OAuth if you set WIWO_LI_CLIENT_ID, otherwise paste a token + author id.', fields: ['handle', 'token', 'authorId'] },
  th: { label: 'Threads', note: 'Meta Graph API — user access token + your Threads user id.', fields: ['handle', 'token', 'authorId'] },
};

function ConnectionsView() {
  const [conns, setConns] = useState<Connection[]>([]);
  const [oauth, setOauth] = useState<{ ma: boolean; x: boolean; li: boolean }>({ ma: true, x: false, li: false });
  const [status, setStatus] = useState('');
  const load = useCallback(() => api.connections().then(setConns), []);
  useEffect(() => { load(); api.oauthStatus().then(setOauth); }, [load]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const o = params.get('oauth');
    if (o === 'ok') setStatus('✓ Connected via OAuth');
    else if (o === 'error') setStatus(`⚠ OAuth failed: ${params.get('reason') || 'unknown'}`);
    if (o) {
      window.history.replaceState({}, '', window.location.pathname + '#connect');
      setTimeout(() => setStatus(''), 6000);
    }
  }, []);

  const flash = (s: string) => { setStatus(s); setTimeout(() => setStatus(''), 6000); };

  return (
    <>
      <div className="head">
        <h1>Connections</h1>
        <p>Connect accounts to let wiwo post for you (native mode). Multiple accounts per platform are supported; the ★ default is used when posting. Tokens are encrypted at rest and never sent to the browser. Prefer to post yourself? You never need any of this — just use Author only.</p>
      </div>
      {status && <div className="sent" style={{ marginBottom: 14, wordBreak: 'break-all' }}>{status}</div>}
      <div className="cards">
        {PLATFORMS.map((pl) => (
          <ConnectionCard key={pl.id} platform={pl.id}
            accounts={conns.filter((c) => c.platform === pl.id)}
            oauthAvailable={pl.id === 'ma' ? oauth.ma : pl.id === 'x' ? oauth.x : pl.id === 'li' ? oauth.li : false}
            onChanged={load} onStatus={flash} />
        ))}
      </div>
    </>
  );
}

const ConnectionCard: FC<{
  platform: Platform;
  accounts: Connection[];
  oauthAvailable: boolean;
  onChanged: () => void;
  onStatus: (s: string) => void;
}> = ({ platform, accounts, oauthAvailable, onChanged, onStatus }) => {
  const meta = CONN_META[platform];
  const [f, setF] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));
  const labels: Record<string, string> = { handle: 'Handle', instance: 'Instance URL', token: 'Access token', appPassword: 'App password', authorId: platform === 'th' ? 'Threads user id' : 'Author id' };
  const places: Record<string, string> = { handle: platform === 'bs' ? 'you.bsky.social' : '@you', instance: 'https://fosstodon.org', token: 'paste token', appPassword: 'xxxx-xxxx-xxxx-xxxx', authorId: platform === 'th' ? '178414…' : 'urn:li:person:…' };

  const connect = async () => {
    setBusy(true);
    try {
      await api.connect({ platform, handle: f.handle, instance: f.instance, token: f.token, appPassword: f.appPassword, authorId: f.authorId });
      onStatus(`✓ Connected ${meta.label}`); setF({}); setAdding(false); onChanged();
    } catch (e: any) { onStatus(`⚠ ${e.message}`); }
    setBusy(false);
  };
  const startOauth = async () => {
    setBusy(true);
    try {
      if (platform === 'ma' && !f.instance) { onStatus('⚠ Enter your Mastodon instance URL first'); setBusy(false); return; }
      const { authUrl } = await api.oauthStart(platform, f.instance);
      window.location.href = authUrl;
    } catch (e: any) { onStatus(`⚠ ${e.message}`); setBusy(false); }
  };
  const test = async (id: string) => {
    setBusy(true);
    try { const r = await api.testConnection(id); onStatus(`${r.ok ? '✓' : '⚠'} ${r.detail}${r.url ? ` → ${r.url}` : ''}`); }
    catch (e: any) { onStatus(`⚠ ${e.message}`); }
    setBusy(false);
  };
  const makeDefault = async (id: string) => { await api.setDefault(id); onChanged(); };
  const disconnect = async (id: string) => { await api.disconnect(id); onChanged(); };

  const showForm = adding || accounts.length === 0;

  return (
    <div className="card">
      <div className="crow">
        <h3>{meta.label}</h3>
        {accounts.length > 0 && <span className="pill pass">{accounts.length} connected</span>}
      </div>

      {accounts.map((a) => (
        <div className="acct" key={a.id}>
          <button className={`star ${a.isDefault ? 'on' : ''}`} title={a.isDefault ? 'default' : 'make default'} onClick={() => makeDefault(a.id)}>★</button>
          <span className="acct-h">{a.handle}</span>
          <button className="mini" onClick={() => test(a.id)} disabled={busy}>test</button>
          <button className="mini" onClick={() => disconnect(a.id)} disabled={busy}>remove</button>
        </div>
      ))}

      {accounts.length > 0 && !adding && (
        <button className="btn-ghost" style={{ width: '100%' }} onClick={() => setAdding(true)}>+ Add another account</button>
      )}

      {showForm && (
        <>
          <div className="ctx" style={{ fontSize: 12.5 }}>{meta.note}</div>
          {platform === 'ma' && (
            <div className="field" style={{ marginBottom: 8 }}>
              <input placeholder="Instance URL — https://fosstodon.org" value={f.instance ?? ''} onChange={(e) => set('instance', e.target.value)} />
            </div>
          )}
          {oauthAvailable && (
            <>
              <button className="btn-add" style={{ width: '100%' }} onClick={startOauth} disabled={busy || (platform === 'ma' && !f.instance)}>
                Connect with {meta.label} (OAuth)
              </button>
              <div className="muted" style={{ fontSize: 11, textAlign: 'center', margin: '4px 0' }}>— or paste a token —</div>
            </>
          )}
          {meta.fields.filter((k) => !(platform === 'ma' && k === 'instance')).map((k) => (
            <div className="field" key={k} style={{ marginBottom: 8 }}>
              <input type={k === 'token' || k === 'appPassword' ? 'password' : 'text'}
                placeholder={`${labels[k]} — ${places[k]}`} value={f[k] ?? ''} onChange={(e) => set(k, e.target.value)} />
            </div>
          ))}
          <button className="btn-ghost" onClick={connect} disabled={busy || !f.handle} style={{ width: '100%' }}>
            {oauthAvailable ? 'Connect with token instead' : 'Connect'}
          </button>
        </>
      )}
    </div>
  );
};

function HistoryView() {
  const [threads, setThreads] = useState<SavedThread[]>([]);
  const [status, setStatus] = useState('');
  const load = useCallback(() => api.listThreads().then((t) => setThreads(t.slice().reverse())), []);
  useEffect(() => { load(); }, [load]);
  const flash = (s: string) => { setStatus(s); setTimeout(() => setStatus(''), 5000); };

  const post = async (id: string) => {
    try { const r = await api.postSaved(id); flash(`${r.ok ? '✓' : '⚠'} ${r.detail}${r.url ? ` → ${r.url}` : ''}`); load(); }
    catch (e: any) { flash(`⚠ ${e.message}`); }
  };
  const remove = async (id: string) => { await api.deleteThread(id); load(); };

  return (
    <>
      <div className="head">
        <h1>Drafts &amp; scheduled</h1>
        <p>Everything you've saved or scheduled. Scheduled threads post automatically when their time arrives; you can also post or delete any of them here.</p>
      </div>
      {status && <div className="sent" style={{ marginBottom: 14, wordBreak: 'break-all' }}>{status}</div>}
      {threads.length === 0 ? (
        <div className="empty"><h3>Nothing saved yet</h3><p className="muted">Compile a thread, then Save draft or Schedule it.</p></div>
      ) : (
        threads.map((t) => (
          <div className="evc" key={t.id} style={{ marginBottom: 12 }}>
            <div className="evh">
              <span className={`pill ${t.status === 'posted' ? 'pass' : t.status === 'scheduled' ? 'build' : 'unknown'}`}>{t.status}</span>
              <span className="sum">{t.thread.date} · {t.thread.platform.toUpperCase()} · {t.mode === 'native' ? 'native' : 'author'}</span>
              {t.scheduledFor && <span className="muted" style={{ fontSize: 12 }}>⏰ {new Date(t.scheduledFor).toLocaleString()}</span>}
              <span className="diffstat" style={{ display: 'flex', gap: 6 }}>
                {t.status !== 'posted' && <button className="mini" onClick={() => post(t.id)}>post now</button>}
                <button className="mini" onClick={() => remove(t.id)}>delete</button>
              </span>
            </div>
            <div style={{ padding: '0 16px 12px', fontSize: 13, color: 'var(--ink-2)', whiteSpace: 'pre-wrap' }}>{t.thread.intro}</div>
            {t.lastResult && !t.lastResult.ok && <div className="err" style={{ padding: '0 16px 12px' }}>{t.lastResult.detail}</div>}
          </div>
        ))
      )}
    </>
  );
}

const FolderPicker: FC<{ start?: string; onPick: (path: string) => void; onClose: () => void }> = ({ start, onPick, onClose }) => {
  const [data, setData] = useState<Awaited<ReturnType<typeof api.browseFs>> | null>(null);
  const [err, setErr] = useState('');
  const go = useCallback((p?: string) => {
    setErr('');
    api.browseFs(p).then(setData).catch((e) => setErr(e.message));
  }, []);
  useEffect(() => { go(start || undefined); }, [go, start]);

  return (
    <div className="modal-bg" onClick={onClose} style={{ zIndex: 60 }}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <h2>Choose a repo folder</h2>
        <div className="pathbar">
          <button className="mini" onClick={() => go(data?.home)} title="Home">⌂</button>
          <button className="mini" disabled={!data?.parent} onClick={() => data?.parent && go(data.parent)} title="Up">↑</button>
          <span className="pathnow" title={data?.path}>{data?.path || '…'}</span>
        </div>
        {err && <div className="err" style={{ marginBottom: 8 }}>{err}</div>}
        <div className="fslist">
          {data?.entries.length === 0 && <div className="muted" style={{ padding: 10 }}>No sub-folders here.</div>}
          {data?.entries.map((e) => (
            <div className="fsrow" key={e.path}>
              <button className="fsnav" onClick={() => go(e.path)} title="Open">
                <span className="fsicon">{e.isGit ? '📦' : '📁'}</span>
                <span className="fsname">{e.name}</span>
                {e.isGit && <span className="gitbadge">git</span>}
              </button>
              {e.isGit && <button className="mini" onClick={() => onPick(e.path)}>Use</button>}
            </div>
          ))}
        </div>
        <div className="modal-actions">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-add" disabled={!data?.isGit} title={data?.isGit ? '' : 'This folder is not a git repo'}
            onClick={() => data && onPick(data.path)}>
            Use this folder{data && !data.isGit ? ' (not a git repo)' : ''}
          </button>
        </div>
      </div>
    </div>
  );
};

function AddProjectModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [name, setName] = useState('');
  const [repoPath, setRepoPath] = useState('');
  const [buildCmd, setBuildCmd] = useState('');
  const [appUrl, setAppUrl] = useState('');
  const [serveCmd, setServeCmd] = useState('');
  const [autoScan, setAutoScan] = useState(true);
  const [enrich, setEnrich] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setErr(''); setBusy(true);
    try {
      await api.addProject({
        name: name.trim(), repoPath: repoPath.trim(),
        buildCmd: buildCmd.trim() || undefined,
        appUrl: appUrl.trim() || undefined,
        serveCmd: serveCmd.trim() || undefined,
        autoScan, enrich,
      });
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
          <label>Repo folder</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={repoPath} onChange={(e) => setRepoPath(e.target.value)} placeholder="pick or paste a folder" style={{ flex: 1 }} />
            <button className="btn-ghost" type="button" onClick={() => setBrowsing(true)}>Browse…</button>
          </div>
          <span className="hint">a local git repository on this machine</span>
        </div>
        {browsing && <FolderPicker start={repoPath} onPick={(p) => { setRepoPath(p); if (!name) setName(p.split('/').pop() || ''); setBrowsing(false); }} onClose={() => setBrowsing(false)} />}
        <div className="field">
          <label>Build command <span style={{ color: 'var(--ink-3)', fontWeight: 400 }}>(optional)</span></label>
          <input value={buildCmd} onChange={(e) => setBuildCmd(e.target.value)} placeholder="npm test" />
          <span className="hint">run to derive 🟢/🔴 build status</span>
        </div>
        <div className="field">
          <label>App URL <span style={{ color: 'var(--ink-3)', fontWeight: 400 }}>(optional)</span></label>
          <input value={appUrl} onChange={(e) => setAppUrl(e.target.value)} placeholder="http://localhost:5173" />
          <span className="hint">for before/after screenshots of the running app</span>
        </div>
        <div className="field">
          <label>Serve command <span style={{ color: 'var(--ink-3)', fontWeight: 400 }}>(optional)</span></label>
          <input value={serveCmd} onChange={(e) => setServeCmd(e.target.value)} placeholder="npm run preview" />
          <span className="hint">builds+serves a past commit on $PORT for true before/after (worktree, read-only)</span>
        </div>
        <label className="checkrow">
          <input type="checkbox" checked={autoScan} onChange={(e) => setAutoScan(e.target.checked)} />
          <span>Auto-log new commits as they land (recommended)</span>
        </label>
        <label className="checkrow">
          <input type="checkbox" checked={enrich} onChange={(e) => setEnrich(e.target.checked)} />
          <span>Ask the agent for a sharper summary after each commit</span>
        </label>
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
