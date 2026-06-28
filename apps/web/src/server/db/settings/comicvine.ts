import { z } from 'zod';
import { defineSetting } from '../settings';

export const comicVineApiKeySetting = defineSetting('comicvine.api_key', z.string(), '');

export function isComicVineConfigured(apiKey: string): boolean {
  return apiKey.length > 0;
}
