# wiwo — what I worked on

> Auto-logged progress for developers who'd rather build than market.
> The daily log writes itself as a byproduct of AI-assisted work, then compiles
> into a shareable thread in one press.

wiwo is a **local-first, Claude Code-native** dashboard. It observes the
artifacts your work already produces — **git commits** and **Claude Code session
transcripts** — and builds a daily log automatically. wiwo is an *observer*: it
only ever reads your repos, never writes to them, and never interrupts your
coding agent mid-build.

See [`docs/wiwo-plan.md`](docs/wiwo-plan.md) for the full plan and
[`docs/wiwo-mockup.html`](docs/wiwo-mockup.html) for the UI mockup.

## What it does (Phase 1 MVP)

- **Dashboard** — one card per project: latest chat context + build status, a
  quick-prompt box, and per-project scan/build actions.
- **Daily log** — a chronological timeline of today's changes, summarized from
  git + the session transcript, with optional one-line notes you can add.
- **wiwo thread** — one press compiles the day's log into a shareable thread,
  organized by project, reshaped for X / LinkedIn / Threads / Mastodon.

## Run locally

**Prerequisites:** Node.js, and local git repos you want to track.

1. `npm install`
2. (optional) copy `.env.example` to `.env` and set `ANTHROPIC_API_KEY` for
   sharper auto-summaries.
3. `npm run dev`
4. Open http://localhost:3000, click **+ Add project**, and point wiwo at a
   local git repo. Hit **Scan git + chat** to log today's commits.

## How the log gets written

| Step | Who | How |
|---|---|---|
| Detect a change | wiwo (mechanical) | watches git commits + session turns |
| Summarize it | wiwo's own summarizer | Claude (or fallback to the commit message) |
| Add a personal note | you (optional) | editable field on every log entry |

Your coding agent stays unaware of wiwo. Any summarizer model can slot in behind
one interface — Claude is the default.
