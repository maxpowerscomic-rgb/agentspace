# wiwo — What I Worked On

> Auto-logged progress for developers who'd rather build than market.
> The daily log writes itself as a byproduct of AI-assisted work, then compiles into a shareable thread in one press.

**Planning doc — v0.1** · Decisions locked in this session:
- **Data source:** Claude Code session transcripts + git history (per project)
- **Project = local git repo + its Claude Code session** (local-first)
- **Deliverable:** this spec + an interactive mockup

---

## 1. The problem & the ICP

**Devon** ships good work but posts about it maybe once every six weeks. They want an audience; they refuse to context-switch out of the work to farm one. Every "build in public" tool today asks them to *stop working and go write* — which is exactly the tax they won't pay.

**Insight:** the log has to write *itself*. If capturing progress costs more than ~90 seconds a day, Devon won't do it. So the design constraint for every feature is: **zero required input, everything auto-generated, everything editable.**

---

## 2. Core loop

```
work in Claude Code  ─▶  wiwo auto-logs changes  ─▶  glance at dashboard
        ▲                  (transcript + git)              │
        │                                                  ▼
   fire new prompts  ◀──────────────────────────  review daily log
   from dashboard                                          │
                                                           ▼
                                          compile wiwo thread ─▶ 1-press export
```

---

## 3. Feature breakdown

### 3.1 Dashboard (glanceable status)
One card per project. Everything readable without a click:
- **Latest context** — the last paragraph of the project's Claude chat, or the most recent prompt.
- **Build status** — 🟢 passing / 🔴 failing / 🟡 building, from the repo's test/CI command.
- **Quick-prompt box** — type a prompt right on the card; it routes into that project's Claude Code session.
- Change count for today, last-active time.

### 3.2 Daily log (the heart)
A chronological, cross-project timeline built automatically:
- `10:25 — Added notebook feature` · `10:36 — Made notebook the default screen` · …
- Each entry: **timestamp**, **auto-summary**, **before/after images**, **optional one-line description** the user can add.
- Entries derived from: commit boundaries, meaningful session turns, and build-status transitions.

### 3.3 wiwo thread (the payoff)
One button — **Compile** — turns the day's log into a shareable thread:
- **Organized by project**, not just chronological.
- All metadata auto-written: post copy, hashtags, image alt-text, thread ordering.
- Fully **editable/revisable** before it goes out.

### 3.4 Export
- Pick a target: X, LinkedIn, Threads, Mastodon, Bluesky.
- wiwo **reshapes** to that platform's format (thread vs. carousel vs. single post; char limits; image specs).
- Copy-to-clipboard or direct post via API.

---

## 4. Who writes what (so the builder doesn't guess)

**Principle: wiwo is an observer, not a participant.** Your project's coding agent stays focused on the work and is *unaware wiwo exists*. wiwo watches the artifacts that work already produces (git commits + Claude Code session transcripts) and generates the log from them. This is what makes logging automatic, universal (any repo you point at it), and model-agnostic.

There are two distinct "writing" moments — keep them separate:

| Step | Who | How | AI? |
|---|---|---|---|
| **1. Detect a change** | wiwo (mechanical) | Watches git commits + session turns: a commit happened at 10:25 touching these files. | No |
| **2. Summarize it** ("Added notebook feature") | **wiwo's own summarizer** | Feeds the diff + transcript slice to a model → one-line log entry. This is wiwo's model, swappable, *not* the project's agent. | Yes |
| **3. Add a personal note** ("finally, it was the SameSite flag") | The user (optional) | Free-text field, always editable. | No |

```
your agent codes  ──▶  git commit + transcript  ──▶  wiwo reads both  ──▶  wiwo's summarizer writes the entry
  (unaware of wiwo)         (the evidence)             (the observer)          (you edit if you want)
```

### The query rule (decided)
wiwo **may query the project's agent for a sharper summary — but only *after the fact*, never during a build.**
- ✅ After a change lands (commit made, session turn complete), wiwo may ask the agent: *"one-line summary of what you just did?"* to enrich the entry.
- ❌ wiwo must **never** interrupt, prompt, or block the agent mid-build. No injected turns while work is in flight.
- Implementation: wiwo watches for a "settled" signal (commit written / session idle) before any query. Passive transcript-reading is always the fallback if querying isn't available — so wiwo still works with any model, and the query is a quality boost, not a dependency.

---

## 5. The hard part: auto-capturing "what changed" + before/after images

This is where wiwo lives or dies. Proposed capture pipeline (local-first):

| Signal | Source | Gives us |
|---|---|---|
| **What changed** | Claude Code session transcript (JSONL) + `git diff` between commits | summary text, timestamp, files touched |
| **When** | commit timestamps + session turn timestamps | the timeline |
| **Build status** | run the repo's test/lint/build command, watch exit code | 🟢/🔴/🟡 per change |
| **Before image** | screenshot taken *before* a change is applied (or on the previous commit) | the "before" |
| **After image** | screenshot after the change / on the new commit | the "after" |

**Before/after images — three tiers, ship them in order:**
1. **Rendered diff cards** (MVP): a clean visual of the code diff. Always available, zero config.
2. **App screenshots** (v2): for web projects, Playwright loads the running app on the old commit vs. new commit and snaps both. *(The existing scaffold already bundles Playwright — reuse it.)*
3. **Manual capture** (always available): a hotkey / drop-zone so Devon can attach a real before/after when the auto one isn't enough.

---

## 6. Architecture (local-first)

```
┌─────────────────────────────────────────────┐
│  wiwo desktop/local app  (runs on Devon's machine)  │
│                                              │
│  Watcher ── tails Claude Code session logs   │
│         └── watches git repos for commits    │
│                                              │
│  Capturer ── runs build cmd (status)         │
│          └── Playwright screenshots (v2)     │
│                                              │
│  Store ── local DB of Projects / Changes /   │
│           DailyLogs / Threads                │
│                                              │
│  UI ── Dashboard · Daily Log · Thread editor │
│                                              │
│  Exporter ── per-platform formatters + APIs  │
└─────────────────────────────────────────────┘
```

**Data model (sketch):**
- `Project { id, name, repoPath, sessionPath, buildCmd, buildStatus, latestContext }`
- `Change { id, projectId, timestamp, summary, filesTouched, beforeImg, afterImg, userNote?, buildStatus }`
- `DailyLog { date, changeIds[] }`
- `Thread { id, date, byProject{ projectId, posts[] }, metadata, targetPlatform }`

**Reuse from the existing repo:** Express + Socket.io server, `/api/upload` for images, Playwright for screenshots, React 19 + Tailwind 4 + Framer Motion front end.

**Model-agnostic path:** summaries/copy are generated by an LLM. Default to Claude; abstract the summarizer behind one interface so any model can slot in later.

---

## 7. Phased roadmap

**Phase 1 — Prove the loop (MVP)**
Dashboard with project cards (latest context + build status) · quick-prompt box · daily log from git commits + session turns · rendered-diff before/after cards · manual note field · Compile → thread → copy-to-clipboard for X. *No auto app-screenshots yet.*

**Phase 2 — Make it effortless**
Playwright app screenshots for web projects · richer auto-summaries · multi-platform export with reshape · editable metadata everywhere.

**Phase 3 — Make it delightful**
Direct posting via platform APIs · streaks / weekly digests · model-agnostic summarizer · scheduled posting.

---

## 8. Open questions for next session
1. **Desktop app vs. local web app?** Electron/Tauri gives a real tray + hotkeys; a local web app (like the current scaffold) is faster to ship. Leaning local web app for MVP.
2. **Screenshot trigger for non-web projects** (CLI, libraries) — rendered-diff cards only, or terminal-output captures?
3. **How opinionated should the auto-copy voice be?** A tone setting (technical / casual / hype) or fully manual?
4. **Privacy:** private repos / secrets must never leak into a thread — needs a redaction pass before compile.
