import { z } from 'zod';
import { defineSetting } from '../settings';

export const nytApiKeySetting = defineSetting('nyt.api_key', z.string(), '');

export function isNytConfigured(k: string): boolean {
  return k.length > 0;
}
