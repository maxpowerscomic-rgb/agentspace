# Third-party notices

wiwo (this repository) is released by Shavon White (@maxpowerscomic) under the
MIT License (see `LICENSE`). That license covers wiwo's own source code.

## Bring your own key

wiwo is **bring-your-own-key**. It never routes requests through wiwo's or
anyone else's account — each user supplies their own credentials:

- Your own AI provider API key (`ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, or
  `OPENAI_API_KEY`) for summaries and live session control.
- Your own social accounts / tokens for native posting.

## Optional proprietary dependency: Claude Agent SDK

The **live Claude Code session control** feature (the dashboard prompt box) uses
[`@anthropic-ai/claude-agent-sdk`](https://github.com/anthropics/claude-agent-sdk-typescript),
which is **proprietary to Anthropic PBC — not open source**. It is declared as
an *optional* dependency: wiwo runs fully without it (that feature simply falls
back to recording the prompt).

If you install and use it, your use is governed by Anthropic's terms, not wiwo's
MIT license:

- Anthropic Commercial Terms / Consumer Terms of Service
- Anthropic Usage Policy
- https://code.claude.com/docs/en/legal-and-compliance

Per those terms, developers building products with the Agent SDK must
authenticate with their **own API key via the Claude Console** — which is
exactly how wiwo works. wiwo does not offer Claude.ai login on your behalf or
route requests through Free/Pro/Max plan credentials.

## Other dependencies

All other runtime dependencies (React, Express, Playwright, Vite, etc.) are
distributed under their own permissive open-source licenses (MIT / Apache-2.0 /
BSD). See each package for details.
