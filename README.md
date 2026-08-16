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

## What it does

**Phase 1 — the loop**
- **Dashboard** — one card per project: latest chat context + build status, a
  quick-prompt box, and per-project scan/build actions.
- **Daily log** — a chronological timeline of today's changes, summarized from
  git + the session transcript, with optional one-line notes you can add.
- **wiwo thread** — one press compiles the day's log into a shareable thread,
  organized by project, reshaped for X / LinkedIn / Threads / Mastodon.

**Phase 2 — effortless**
- **Auto-scan** — a file watcher on each repo's `.git/logs/HEAD` logs new
  commits the moment they land (never mid-build). Toggle per project; the
  dashboard updates live over SSE.
- **App screenshots** — capture before/after images of the running app via
  Playwright (set an app URL). Read-only: it snaps the live app, never checks
  out old commits.
- **Editable, saved threads** — edit any line of the compiled thread; save it
  as a draft.

**Phase 3 — delightful**
- **Model-agnostic summarizer** — Claude by default; Gemini or any
  OpenAI-compatible endpoint via `WIWO_PROVIDER`; heuristic fallback with no key.
- **Streaks + weekly digest** — a consecutive-days streak and a 7-day rollup by
  project.
- **Scheduled posting** — schedule a thread for later; wiwo fires it via a
  configurable webhook (`WIWO_POST_WEBHOOK` → Zapier/Make/your own poster), or
  marks it posted for manual paste.

**Phase 4 — live session control**
- **The prompt box drives a real Claude Code session** — typing into a project
  card runs the prompt in that repo via the [Claude Agent SDK]
  (`@anthropic-ai/claude-agent-sdk`), continuing the same conversation across
  turns (the session id is persisted and resumed). The agent's reply shows on
  the card, and wiwo auto-scans afterward so any commit it made is logged.
- **After-the-fact summary query** — enable per project to have wiwo ask the
  agent for a sharper one-line summary *once a commit has landed* — never
  mid-build, read-only.
- Requires `ANTHROPIC_API_KEY` and the optional SDK (`npm i
  @anthropic-ai/claude-agent-sdk`). Without either, the prompt box gracefully
  falls back to recording the prompt — wiwo still works.

**Native posting (author-vs-post toggle)**
- Every thread has a mode toggle: **Author only** (default — wiwo writes it, you
  copy/paste; no account or credential needed) or **Post natively** (wiwo posts
  to your connected account and returns the permalink).
- **Connections** — connect an account in the Connections view. Credentials live
  in your local wiwo store and are never sent to the browser (the API redacts
  them). Fully working with just user credentials:
  - **Mastodon** — instance URL + access token; posts a real reply-chain.
  - **Bluesky** — handle + app password; posts a real reply-chain (AT Protocol).
  - **X** — user OAuth 2.0 access token (`tweet.write`) from your own app.
  - **LinkedIn** — access token (`w_member_social`) + author id from your own app.
  - **Threads** — pending Meta app review.
- Native posts report per-platform success (with the live link) or a clear
  failure reason, and scheduled threads post natively when their time arrives.
- **Mastodon OAuth** — connect with just your instance URL (wiwo registers an
  app dynamically and runs the authorize → callback → token flow); no token to
  paste. X/LinkedIn still take a token from your own app.

**Live streaming**
- The agent's reply streams **token-by-token** into the project card as it works
  (via the Agent SDK's `includePartialMessages`, over Server-Sent Events).

**Hardening & completeness**
- **Encrypted secrets at rest** — connection tokens are AES-256-GCM encrypted in
  `data/wiwo.json` (key from `WIWO_SECRET_KEY` or an auto-generated `data/.key`).
- **X + LinkedIn OAuth** — one-click connect when you set the app client id/secret
  env vars (X uses PKCE); pasted tokens still work otherwise. **Token refresh** is
  automatic before posting when a refresh token is present.
- **Threads posting** — via the Meta Graph API (token + Threads user id).
- **Native media** — before/after screenshots are uploaded with the post on
  Mastodon and Bluesky.
- **Multiple accounts per platform**, with a ★ default used when posting.
- **Char-limit validation** — per-platform caps shown live in the composer and
  enforced before a native post so it can't be rejected for length.
- **True before/after** — set a project `serveCmd` and wiwo renders the change's
  parent commit in a throwaway git worktree (read-only) for a real visual diff.
- **Drafts & scheduled view** — browse, post, or delete saved and scheduled
  threads; scheduled ones fire automatically.
- **Tests** — `npm test` runs the pure-logic suite (compile, digest, limits,
  crypto round-trip).

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

## License

wiwo's own source is MIT licensed — © 2026 Shavon White (@maxpowerscomic). See
[`LICENSE`](LICENSE).

wiwo is bring-your-own-key and never routes requests through anyone else's
account. The optional live-session feature uses Anthropic's proprietary
`@anthropic-ai/claude-agent-sdk` (governed by Anthropic's terms, not MIT) — it's
an optional dependency and wiwo runs fully without it. See [`NOTICE.md`](NOTICE.md).
