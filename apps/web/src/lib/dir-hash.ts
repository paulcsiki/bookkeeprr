import { createHash } from 'node:crypto';

export function dirHash(directory: string): string {
  return createHash('sha1').update(directory).digest('hex').slice(0, 12);
}
