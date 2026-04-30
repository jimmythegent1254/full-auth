import { randomBytes } from 'crypto';

export function generateVerificationToken() {
  return randomBytes(32).toString('hex');
}
