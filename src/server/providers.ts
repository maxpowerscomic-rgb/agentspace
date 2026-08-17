// Model-agnostic text generation (Phase 3). wiwo's summarizer talks to one of
// several providers behind a single interface. Default: Claude. Any provider
// can slot in via WIWO_PROVIDER; if none is configured, callers fall back to a
// non-AI heuristic so wiwo always works.
export type ProviderName = 'anthropic' | 'gemini' | 'openai' | 'bridge' | 'none';

/**
 * "Bridge mode" routes wiwo's AI through your LOCAL Claude Code CLI (`claude -p`)
 * instead of a raw API key — so it uses whatever auth Claude Code has, including
 * your Claude Pro/Max subscription login.
 *
 * ⚠️ This is for YOUR OWN personal use of your own Claude Code login on your own
 * machine (ordinary Claude Code usage). Anthropic does NOT permit routing OTHER
 * people's requests through a subscription — do not run wiwo as a shared/hosted
 * service in bridge mode on others' behalf. Enable explicitly with
 * WIWO_AI_MODE=bridge.
 */
export function bridgeEnabled(): boolean {
  return (process.env.WIWO_AI_MODE || '').toLowerCase() === 'bridge';
}

export function activeProvider(): ProviderName {
  if (bridgeEnabled()) return 'bridge';
  const explicit = (process.env.WIWO_PROVIDER || '').toLowerCase() as ProviderName;
  if (explicit && ['anthropic', 'gemini', 'openai', 'none'].includes(explicit)) return explicit;
  // Auto-detect from whichever key is present.
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.GEMINI_API_KEY) return 'gemini';
  if (process.env.OPENAI_API_KEY) return 'openai';
  return 'none';
}

/** Generate a short completion, or null if unavailable/failed (caller falls back). */
export async function generate(prompt: string, maxTokens = 60): Promise<string | null> {
  switch (activeProvider()) {
    case 'bridge':
      return bridge(prompt);
    case 'anthropic':
      return anthropic(prompt, maxTokens);
    case 'gemini':
      return gemini(prompt, maxTokens);
    case 'openai':
      return openai(prompt, maxTokens);
    default:
      return null;
  }
}

/** Bridge: shell out to the local Claude Code CLI in headless "print" mode. */
async function bridge(prompt: string): Promise<string | null> {
  const bin = process.env.WIWO_CLAUDE_BIN || 'claude';
  try {
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const exec = promisify(execFile);
    // `claude -p` prints a completion using Claude Code's own auth (subscription
    // login or its own key). No ANTHROPIC_API_KEY required.
    const { stdout } = await exec(bin, ['-p', prompt, '--output-format', 'text'], {
      timeout: 60_000,
      maxBuffer: 1024 * 1024,
    });
    return stdout.trim() || null;
  } catch {
    return null; // CLI missing / not logged in → caller falls back to heuristic
  }
}

async function anthropic(prompt: string, maxTokens: number): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const model = process.env.WIWO_MODEL || 'claude-opus-5';
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    return (data?.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('').trim() || null;
  } catch {
    return null;
  }
}

async function gemini(prompt: string, maxTokens: number): Promise<string | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const model = process.env.WIWO_MODEL || 'gemini-2.5-flash';
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: maxTokens },
        }),
      },
    );
    if (!res.ok) return null;
    const data: any = await res.json();
    return (data?.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text).join('').trim() || null;
  } catch {
    return null;
  }
}

async function openai(prompt: string, maxTokens: number): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const model = process.env.WIWO_MODEL || 'gpt-4o-mini';
  const base = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    return (data?.choices?.[0]?.message?.content ?? '').trim() || null;
  } catch {
    return null;
  }
}
