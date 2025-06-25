import crypto from 'crypto';

export function hashData(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}