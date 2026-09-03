# wiwo v2 — "log and keep going"

*A redesign plan: wiwo becomes a focus-session logger (pomodoro-style) that
turns work chunks into publishable content, with as close to zero friction as
possible.*

Current screens (v1) are captured in [`docs/screens/`](screens/) for reference.

---

## 1. The shift

**v1 wiwo** is a dashboard you *visit*: projects, daily log, threads, digest —
six views, lots of surface. You come to it after the fact.

**v2 wiwo** is a companion that *interrupts you on your schedule*: you set a
task, work in intervals, and at each interval boundary wiwo asks one question —
"what happened?" — answers it for you when it can, and gets out of the way.
Publishable content falls out of the session automatically.

The design north star (the Jobs test): **every screen has exactly one job, one
primary action, and could be understood by someone who has never seen the app.**
If a control isn't needed *right now*, it doesn't exist on screen.

## Decisions locked (review round 1)

- **Interval**: 30 min default, presets 25 / 30 / 50, free-form allowed.
- **Terminology**: a work interval is a **sprint**. A session is a run of sprints.
- **Check-in is manual-exit, not auto-resume.** After you log what you did, you
  choose **Back to work** (start the next sprint) or **End sprint** (finish the
  session). wiwo never silently restarts the clock.
- **Pull from changelog is a button, not automatic.** The entry field starts
  empty (or with your typing); a **⤵ Pull from changelog** button drops in what
  wiwo detected from commits, which you can then edit. You stay in control of
  what gets written.
- **Project switch inside the check-in.** When logging, a **+ worked on another
  project** option lets you attribute the sprint (or add a second line) to a
  different project without leaving the flow.
- **Sprints are publishable** — each sprint can be posted to your linked
  accounts on its own, or all sprints published together at the recap.
- **Onboarding includes connecting social accounts**, so publishing works from
  the first session (still skippable — author-only mode needs no account).
- **v1 stays** behind "⋯" as **Library** (log, digest, drafts, connections).

## 2. The loop

```
SET TASK  →  WORK  →  CHECK-IN  →  WORK  →  CHECK-IN  →  …  →  END
   ↑                     (30 min, or user-set interval)            ↓
   └────────────────  RECAP → publishable thread  ────────────────┘
```

1. **Set a task.** One sentence ("Ship dark mode"), pick a project, pick an
   interval (default 30 min). Press Start. That's the entire setup.
2. **Work.** wiwo is silent. A timer runs. If the project has auto-scan on,
   wiwo quietly collects commits/changelog entries as they land.
3. **Check-in (the heart of the app).** At each sprint boundary wiwo sends a
   notification. Tapping it opens ONE card:
   - A text field for one line. Tap **⤵ Pull from changelog** to drop in what
     wiwo detected (commits since the last sprint); edit freely, or just type.
   - Optional **+ worked on another project** to attribute or add a second line
     for a different project.
   - Then choose **Back to work** (starts the next sprint) or **End sprint**.
   - Optionally **publish this sprint** to a linked account right here.
   - Target: a few seconds, then straight back to work.
4. **Recap (End sprint).** Total time, the sprint timeline, and — already
   compiled — the session thread ("1h30 on Ship dark mode: scaffolded settings →
   wired toggle → fixed flash"). Publish **all sprints together**, or any single
   sprint; or copy / edit / save for later.

**The chunk is the atomic unit.** A chunk = one interval + one line + whatever
commits landed in it. Days, threads, and digests are all just rollups of chunks,
so everything v1 does still exists — it's derived, not managed.

## 3. Screens (mockups: [`pomo-mockup.html`](pomo-mockup.html))

| # | Screen | Its one job | Primary action |
|---|--------|-------------|----------------|
| 1 | **Start** | Name the work | Start |
| 2 | **Focus** | Show time remaining; stay out of the way | (none — work) |
| 3 | **Check-in** | Log the chunk in ≤5s | Log it → keep going |
| 4 | **Recap** | Approve the story of the session | Publish |
| — | **Notification** | Pull you into the check-in | Tap |

Everything else — connections, retro threads, drafts, digest, settings — moves
behind a single "⋯" on the Start screen. Present, but never in the loop.

### Design rules
- One column, one accent color (wiwo indigo), one type scale. No cards-of-cards.
- The timer is the interface during Focus: huge numerals, thin progress ring,
  task name, nothing else. Chunks already logged appear as small ticks.
- The check-in field is **pre-filled** whenever wiwo can pre-fill it. Editing is
  allowed; it should rarely be needed.
- No empty states that ask for work. If wiwo has nothing, it says so in one
  line and offers the single next action.
- Skipping a check-in is always allowed and never punished (the next check-in
  covers both intervals).

## 4. What powers it (mostly already built)

| Need | Have today | Gap |
|------|-----------|-----|
| Detect changes per interval | git scanner + `.git/logs/HEAD` watcher + SSE | Filter by "since last check-in" instead of "today" |
| Auto-write the entry line | summarizer (bridge-by-default) + enrich | Prompt variant for "chunk" granularity |
| Compile session → thread | compile/export + retro bucketing | Bucket by session/chunk instead of day |
| Notify the user | SSE toast (in-app) | Real notifications: Web Push through the PWA service worker (desktop + Android), and native local notifications in the iOS wrapper. Timer itself lives server-side so it fires even with the tab closed |
| Publish | native posting + author mode + saved threads | Unchanged |

### New data model
```ts
interface Task    { id; projectId; title; intervalMin; createdAt; status }
interface Session { id; taskId; startedAt; endedAt?; chunks: Chunk[] }
interface Chunk   { id; index; startedAt; endedAt; line; auto: boolean;
                    commits: string[]; skipped?: boolean }
```
`Change` (v1) maps 1:1 onto commits inside chunks, so the daily log, digest and
streak keep working from the same store.

## 5. Build phases

1. **Session engine** — Task/Session/Chunk store, server-side interval timer,
   "changes since last check-in" scan, chunk summarizer. API + tests.
2. **The four screens** — replace the default view with Start → Focus →
   Check-in → Recap. v1 views remain reachable under "⋯" (nothing deleted).
3. **Notifications** — Web Push (VAPID) via the existing service worker;
   local notifications in the Capacitor iOS shell; in-app SSE as fallback.
4. **Recap → publish** — session-bucketed compile, reuse the composer +
   native posting as-is.
5. **Polish** — sounds off by default, reduced-motion, keyboard-only check-in
   (Enter logs), auto-end after N silent intervals.

## 6. Review status

Round 1 questions all resolved — see **Decisions locked** at the top. Next
review is on the updated mockups (this doc's [`pomo-mockup.html`](pomo-mockup.html)):
the revised check-in card (pull-from-changelog button, project-switch, back-to-work
vs end-sprint) and the recap (publish-all vs per-sprint). Once those read right,
build starts at Phase 1 (session engine).
