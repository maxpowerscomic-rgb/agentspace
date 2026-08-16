# wiwo — marketing site

Static landing page + interactive browser demo for wiwo. **Fully static** — the
wiwo *app* itself runs locally on the user's machine (it needs a persistent Node
server, git access, and Playwright), so only the marketing site is hosted here.

## Files
- `index.html` — the landing page
- `demo.html` — interactive dashboard demo (sample data), banner links back
- `og.png` / `og.svg` — social share image (1200×630)

## Deploy to Netlify

**Option A — drag & drop (fastest):**
Netlify dashboard → *Add new site → Deploy manually* → drag the `site/` folder in.

**Option B — from Git (auto-deploys on push):**
Connect the repo. The root `netlify.toml` already sets:
- publish directory: `site`
- no build command (hand-authored static HTML)

## After deploy
- Point the CTAs at your real repo/URL if they change (search for
  `github.com/maxpowerscomic-rgb/agentspace`).
- Add a custom domain in Netlify (e.g. `wiwo.dev`) and update the `og:image`
  URLs to absolute (`https://your-domain/og.png`) so link previews render on X,
  LinkedIn, etc.
