// v2 "log and keep going" — the focus-session loop.
// Start → Focus (timer) → Check-in → Recap. This is the default surface; the v1
// dashboard/log/thread/etc. live behind the ⋯ Library.
import { useEffect, useState, useCallback, useRef, type FC } from 'react';
import { api, type SessionView, type Formatted } from './api';
import type { Project, Platform, PostMode, Thread } from './types';
import { registerPush } from './push';
import { scheduleCheckinNotif, cancelCheckinNotif } from './native-notif';

const PRESETS = [25, 30, 50];

function fmtClock(sec: number): string {
  const m = Math.floor(Math.max(0, sec) / 60);
  const s = Math.max(0, sec) % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
function fmtDur(mins: number): string {
  const h = Math.floor(mins / 60), m = mins % 60;
  return h ? `${h}h${m ? ` ${m}m` : ''}` : `${m}m`;
}

export function FocusApp({ onOpenLibrary }: { onOpenLibrary: () => void }) {
  const [session, setSession] = useState<SessionView>(null);
  const [ended, setEnded] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try { setSession(await api.getSession()); } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Live check-in nudge: the server flips the session; SSE tells us to refresh.
  useEffect(() => {
    const es = new EventSource('/api/events');
    es.addEventListener('checkin', () => refresh());
    return () => es.close();
  }, [refresh]);

  // On the native app, schedule a local notification at the sprint boundary.
  useEffect(() => {
    if (session && session.status === 'running' && session.checkinDueAt) {
      scheduleCheckinNotif(session.checkinDueAt, `Check-in · ${session.title}`, 'Time to log this sprint & keep going.');
    } else {
      cancelCheckinNotif();
    }
  }, [session?.status, session?.checkinDueAt, session?.title]);

  if (loading) return <div className="foc-wrap" />;

  if (ended) return <Recap session={ended} onDone={() => { setEnded(null); refresh(); }} onOpenLibrary={onOpenLibrary} />;
  if (!session) return <Start onStarted={(s) => setSession(s)} onOpenLibrary={onOpenLibrary} />;
  if (session.status === 'awaiting-checkin')
    return <Checkin session={session} onContinue={(s) => setSession(s)} onEnded={(e) => { setSession(null); setEnded(e); }} />;
  return <Focus session={session} onFlip={refresh} onEnded={(e) => { setSession(null); setEnded(e); }} onOpenLibrary={onOpenLibrary} />;
}

// ---------- 1 · START ----------
const Start: FC<{ onStarted: (s: SessionView) => void; onOpenLibrary: () => void }> = ({ onStarted, onOpenLibrary }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [title, setTitle] = useState('');
  const [interval, setInterval] = useState(30);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.listProjects().then((ps) => { setProjects(ps); if (ps[0]) setProjectId(ps[0].id); });
    registerPush().catch(() => {});
  }, []);

  const start = async () => {
    if (!title.trim() || !projectId) { setErr('Name the work and pick a project.'); return; }
    setBusy(true); setErr('');
    try { onStarted(await api.startSession({ projectId, title: title.trim(), intervalMin: interval })); }
    catch (e: any) { setErr(e.message); setBusy(false); }
  };

  return (
    <div className="foc-wrap">
      <button className="foc-menu" onClick={onOpenLibrary} title="Library">⋯</button>
      <div className="foc-start">
        <h1>What are you<br />working on?</h1>
        <input className="foc-taskline" value={title} autoFocus placeholder="Ship dark mode"
          onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && start()} />
        <div className="foc-chips">
          {projects.length > 0 ? (
            <select className="foc-chip b" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          ) : <span className="foc-chip">no projects — add one in ⋯ Library</span>}
          <div className="foc-ivl">
            {PRESETS.map((m) => (
              <button key={m} className={`foc-chip${interval === m ? ' b' : ''}`} onClick={() => setInterval(m)}>{m}m</button>
            ))}
          </div>
        </div>
        {err && <div className="foc-err">{err}</div>}
        <button className="foc-go" disabled={busy || !projectId} onClick={start}>Start</button>
        <div className="foc-hint">wiwo will check in every {interval} minutes</div>
      </div>
    </div>
  );
};

// ---------- 2 · FOCUS ----------
const Focus: FC<{ session: SessionView; onFlip: () => void; onEnded: (e: any) => void; onOpenLibrary: () => void }> = ({ session, onFlip, onEnded, onOpenLibrary }) => {
  const s = session!;
  const [left, setLeft] = useState(s.remainingSec);
  const flipped = useRef(false);

  useEffect(() => { setLeft(s.remainingSec); flipped.current = false; }, [s.id, s.sprints.length, s.remainingSec]);
  useEffect(() => {
    const t = window.setInterval(() => {
      setLeft((v) => {
        if (v <= 1 && !flipped.current) { flipped.current = true; setTimeout(onFlip, 800); }
        return v - 1;
      });
    }, 1000);
    return () => window.clearInterval(t);
  }, [onFlip]);

  const total = s.intervalMin * 60;
  const frac = Math.max(0, Math.min(1, left / total));
  const dash = 628, offset = dash * (1 - frac);
  const sprint = s.sprints[s.sprints.length - 1];
  const logged = s.sprints.filter((x) => x.line && !x.skipped);

  const endNow = async () => { onEnded(await api.endSession(s.id)); };

  return (
    <div className="foc-wrap">
      <button className="foc-menu" onClick={onOpenLibrary} title="Library">⋯</button>
      <div className="foc-focus">
        <div className="foc-task">{s.title}</div>
        <div className="foc-proj">sprint {sprint.index} · check-in every {s.intervalMin}m</div>
        <div className="foc-ring">
          <svg width="220" height="220" viewBox="0 0 220 220">
            <circle cx="110" cy="110" r="100" fill="none" stroke="var(--line-soft)" strokeWidth="7" />
            <circle cx="110" cy="110" r="100" fill="none" stroke="var(--brand)" strokeWidth="7"
              strokeLinecap="round" strokeDasharray={dash} strokeDashoffset={offset}
              transform="rotate(-90 110 110)" style={{ transition: 'stroke-dashoffset 1s linear' }} />
          </svg>
          <div className="foc-ring-t"><b>{fmtClock(left)}</b><span>until check-in</span></div>
        </div>
        <div className="foc-ticks">
          {logged.map((x) => (
            <div className="foc-tick" key={x.id}><span className="c">✓</span>{x.line}</div>
          ))}
          {logged.length === 0 && <div className="foc-tick muted-tick">Logged sprints show up here.</div>}
        </div>
        <button className="foc-end" onClick={endNow}>End session</button>
      </div>
    </div>
  );
};

// ---------- 3 · CHECK-IN ----------
const Checkin: FC<{ session: SessionView; onContinue: (s: SessionView) => void; onEnded: (e: any) => void }> = ({ session, onContinue, onEnded }) => {
  const s = session!;
  const sprint = s.sprints[s.sprints.length - 1];
  const [line, setLine] = useState('');
  const [auto, setAuto] = useState(false);
  const [commits, setCommits] = useState<string[]>([]);
  const [detected, setDetected] = useState<number | null>(null);
  const [pulling, setPulling] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [altProjectId, setAltProjectId] = useState('');
  const [showAlt, setShowAlt] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.listProjects().then(setProjects);
    // Pre-check how many commits are available (but don't fill until asked).
    api.scanSprint(s.id).then((r) => setDetected(r.count)).catch(() => setDetected(0));
  }, [s.id]);

  const pull = async () => {
    setPulling(true);
    try {
      const r = await api.scanSprint(s.id);
      if (r.line) { setLine(r.line); setAuto(true); setCommits(r.commits); }
      setDetected(r.count);
    } finally { setPulling(false); }
  };

  const go = async (action: 'continue' | 'end') => {
    setBusy(true);
    const body = { line: line.trim(), auto, commits, altProjectId: showAlt ? altProjectId : undefined, action };
    const res = await api.checkin(s.id, body);
    if (action === 'end' || res?.ended) onEnded(res);
    else onContinue(res);
  };

  return (
    <div className="foc-wrap">
      <div className="foc-checkin">
        <div className="foc-when">Sprint {sprint.index} done · {s.intervalMin} min</div>
        <h1>What did you<br />get done?</h1>
        <textarea className="foc-entry" value={line} autoFocus placeholder="One line — what you shipped this sprint"
          onChange={(e) => { setLine(e.target.value); setAuto(false); }} />
        <div className="foc-pullrow">
          <button className="foc-pull" onClick={pull} disabled={pulling || !detected}>
            {pulling ? 'pulling…' : '⤵ Pull from changelog'}
          </button>
          {detected !== null && <span className="foc-detected">{detected} commit{detected === 1 ? '' : 's'}</span>}
        </div>
        {!showAlt ? (
          <button className="foc-another" onClick={() => setShowAlt(true)}>+ worked on another project</button>
        ) : (
          <div className="foc-altrow">
            <span>attribute to</span>
            <select value={altProjectId} onChange={(e) => setAltProjectId(e.target.value)}>
              <option value="">(this project)</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}
        <div className="foc-twobtn">
          <button className="foc-go" disabled={busy} onClick={() => go('continue')}>Back to work</button>
          <button className="foc-ghost" disabled={busy} onClick={() => go('end')}>End sprint</button>
        </div>
      </div>
    </div>
  );
};

// ---------- 4 · RECAP ----------
const Recap: FC<{ session: any; onDone: () => void; onOpenLibrary: () => void }> = ({ session, onDone, onOpenLibrary }) => {
  const s = session;
  const logged = (s.sprints || []).filter((x: any) => x.line && !x.skipped);
  const mins = s.endedAt ? Math.max(1, Math.round((new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()) / 60000)) : 0;

  const [thread, setThread] = useState<Thread | null>(null);
  const [formatted, setFormatted] = useState<Formatted | null>(null);
  const [platform, setPlatform] = useState<Platform>('x');
  const [hasConn, setHasConn] = useState(false);
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => { api.sessionThread(s.id, platform).then((r) => { setThread(r.thread); setFormatted(r.formatted); }); }, [s.id, platform]);
  useEffect(() => { api.connections().then((c) => setHasConn(c.length > 0)).catch(() => {}); }, []);

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3500); };

  const publishAll = async () => {
    setBusy('all');
    try {
      const mode: PostMode = hasConn ? 'native' : 'author';
      const r = await api.publishSession(s.id, { platform, mode });
      flash(r.result.ok ? (r.result.url ? `Published → ${r.result.url}` : 'Published all sprints ✓') : `Couldn’t post: ${r.result.detail}`);
    } catch (e: any) { flash(e.message); } finally { setBusy(''); }
  };
  const publishOne = async (sprintId: string) => {
    setBusy(sprintId);
    try {
      const mode: PostMode = hasConn ? 'native' : 'author';
      const r = await api.publishSession(s.id, { platform, mode, sprintId });
      flash(r.result.ok ? 'Sprint published ✓' : `Couldn’t post: ${r.result.detail}`);
    } catch (e: any) { flash(e.message); } finally { setBusy(''); }
  };
  const copy = async () => { if (formatted) { await navigator.clipboard.writeText(formatted.combined).catch(() => {}); flash('Copied to clipboard'); } };

  return (
    <div className="foc-wrap">
      <button className="foc-menu" onClick={onOpenLibrary} title="Library">⋯</button>
      <div className="foc-recap">
        <div className="foc-done">Session complete</div>
        <h1 className="foc-recap-h">{s.title}</h1>
        <div className="foc-meta">{fmtDur(mins)} · {logged.length} sprint{logged.length === 1 ? '' : 's'}</div>
        <div className="foc-plat">
          {(['x', 'li', 'th', 'ma', 'bs'] as Platform[]).map((p) => (
            <button key={p} className={platform === p ? 'on' : ''} onClick={() => setPlatform(p)}>{p.toUpperCase()}</button>
          ))}
        </div>
        <div className="foc-chunks">
          {logged.map((x: any) => (
            <div className="foc-chunk" key={x.id}>
              <span className="d" /><span className="tx">{x.line}</span>
              <button className="pubone" disabled={busy === x.id} onClick={() => publishOne(x.id)}>
                {busy === x.id ? '…' : x.postResult?.ok ? 'posted ✓' : 'publish ▸'}
              </button>
            </div>
          ))}
          {logged.length === 0 && <div className="muted-tick">No sprints logged — nothing to publish.</div>}
        </div>
        {thread && (
          <div className="foc-thread">
            <b>Your thread — ready {hasConn ? '· native' : '· author'}</b>
            {thread.intro}
            {thread.posts[0] && <div className="foc-thread-more">{thread.posts.length} post{thread.posts.length === 1 ? '' : 's'} · {platform.toUpperCase()}</div>}
          </div>
        )}
        <button className="foc-go" disabled={!logged.length || busy === 'all'} onClick={publishAll}>
          {busy === 'all' ? 'Publishing…' : hasConn ? 'Publish all sprints' : 'Compile & copy thread'}
        </button>
        <div className="foc-alt"><span onClick={copy}>Copy</span><span onClick={onOpenLibrary}>Edit in Library</span><span onClick={onDone}>Done</span></div>
      </div>
      {toast && <div className="toast">✦ {toast}</div>}
    </div>
  );
};
