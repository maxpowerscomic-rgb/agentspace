# Bridge mode — use your Claude subscription instead of an API key

By default wiwo's AI (log summaries + the live "drive my session" feature) uses a
provider **API key** (`ANTHROPIC_API_KEY`, or Gemini/OpenAI). **Bridge mode**
instead routes that AI through your **local Claude Code CLI**, which uses
whatever auth Claude Code has — including your **Claude Pro/Max subscription
login**. No API key required.

## Enable it

1. Install Claude Code and log in with your subscription:
   ```sh
   npm i -g @anthropic-ai/claude-code   # or however you install it
   claude login                          # sign in with your Claude account
   ```
2. Turn on bridge mode for wiwo (in `.env` or the environment):
   ```sh
   WIWO_AI_MODE=bridge
   # optional, if `claude` isn't on your PATH:
   WIWO_CLAUDE_BIN=/usr/local/bin/claude
   ```
3. Start wiwo. `GET /api/health` will report `"bridge": true` and
   `"provider": "bridge"`.

Under the hood, summaries run via `claude -p "<prompt>"` (Claude Code's headless
"print" mode), and the live-session feature lets the Agent SDK use your Claude
Code login. If the CLI is missing or you're not logged in, wiwo silently falls
back to commit-message summaries — it never breaks.

## ⚠️ Important boundary (please read)

Bridge mode is for **your own personal use of your own Claude Code login on your
own machine** — i.e. ordinary Claude Code usage. Anthropic's terms **do not
permit** building a product or service that routes **other people's** requests
through a Free/Pro/Max subscription on their behalf.

So:

- ✅ Fine: you run wiwo for yourself in bridge mode.
- ❌ Not allowed: hosting wiwo as a shared/multi-user service in bridge mode that
  posts or summarizes on other people's behalf using a subscription login.

If you ever distribute wiwo as a hosted service, each user must bring their own
**API key** (the default mode). See
<https://code.claude.com/docs/en/legal-and-compliance>.
