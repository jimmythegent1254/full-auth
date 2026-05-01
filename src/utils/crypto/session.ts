import { randomBytes } from 'crypto';

export function generateSessionId() {
  return randomBytes(32).toString('hex');
}
