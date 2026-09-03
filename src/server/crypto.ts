// Encrypt secrets at rest (connection tokens, app passwords, client secrets).
// AES-256-GCM. The key comes from WIWO_SECRET_KEY (hex/base64) or a generated
// data/.key file (0600). Ciphertext is stored as "enc:v1:<iv>:<tag>:<data>"
// (base64 parts) so we can tell encrypted from legacy plaintext and migrate.
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KEY_FILE = path.resolve(__dirname, '../../data/.key');
const PREFIX = 'enc:v1:';

let cachedKey: Buffer | null = null;

function loadKey(): Buffer {
  if (cachedKey) return cachedKey;
  const env = process.env.WIWO_SECRET_KEY;
  if (env) {
    const buf = env.length === 64 ? Buffer.from(env, 'hex') : Buffer.from(env, 'base64');
    if (buf.length === 32) return (cachedKey = buf);
  }
  try {
    if (fs.existsSync(KEY_FILE)) {
      const buf = Buffer.from(fs.readFileSync(KEY_FILE, 'utf8').trim(), 'hex');
      if (buf.length === 32) return (cachedKey = buf);
    }
  } catch { /* regenerate below */ }
  const key = crypto.randomBytes(32);
  try {
    fs.mkdirSync(path.dirname(KEY_FILE), { recursive: true });
    fs.writeFileSync(KEY_FILE, key.toString('hex'), { mode: 0o600 });
  } catch { /* in-memory only if the fs is read-only */ }
  return (cachedKey = key);
}

export function isEncrypted(value: string | undefined): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

export function encrypt(plain: string | undefined): string | undefined {
  if (plain == null || plain === '') return plain;
  if (isEncrypted(plain)) return plain; // already encrypted
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', loadKey(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${data.toString('base64')}`;
}

export function decrypt(value: string | undefined): string | undefined {
  if (value == null || !isEncrypted(value)) return value; // legacy plaintext passes through
  try {
    const [, , ivB, tagB, dataB] = value.split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', loadKey(), Buffer.from(ivB, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(dataB, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return undefined; // wrong key / corrupt — treat as missing
  }
}
