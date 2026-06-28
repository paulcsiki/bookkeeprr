import { describe, expect, it } from 'vitest';
import { isProwlarrConfigured } from '@/server/db/settings/prowlarr';

describe('isProwlarrConfigured', () => {
  it('true only when url + apiKey set', () => {
    expect(isProwlarrConfigured({ url: 'http://p', apiKey: 'k' })).toBe(true);
    expect(isProwlarrConfigured({ url: '', apiKey: 'k' })).toBe(false);
    expect(isProwlarrConfigured({ url: 'http://p', apiKey: '' })).toBe(false);
  });
});
