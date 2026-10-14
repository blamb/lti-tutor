/**
 * Secrets at rest. A Moodle web-service token is stored per course, so it is
 * encrypted with AES-256-GCM under a key derived from TOKEN_SECRET (falling
 * back to LTI_COOKIE_SECRET). The stored form is "v1.<iv>.<tag>.<ciphertext>"
 * in base64url. Rotating the secret invalidates stored tokens; the
 * instructor then reconnects.
 */

import crypto from 'node:crypto';
import { env } from './env.js';

function key(): Buffer {
  return crypto.createHash('sha256').update(env.TOKEN_SECRET || env.LTI_COOKIE_SECRET).digest();
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), ct.toString('base64url')].join('.');
}

/** null when the stored value is empty, malformed, or was encrypted under another secret. */
export function decryptSecret(stored: string): string | null {
  if (!stored) return null;
  const parts = stored.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') return null;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(parts[1]!, 'base64url'));
    decipher.setAuthTag(Buffer.from(parts[2]!, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(parts[3]!, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
