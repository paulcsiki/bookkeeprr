import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  sendApprise,
  AppriseError,
  __setAppriseFetcherForTests,
  __resetAppriseForTests,
} from '@/server/notifications/apprise';

const formatted = {
  title: 't',
  body: 'b',
  color: 0xabcdef,
  level: 'info' as const,
};

beforeEach(() => __resetAppriseForTests());
afterEach(() => __resetAppriseForTests());

describe('sendApprise', () => {
  it('POSTs { title, body, type } to the configured URL', async () => {
    let capturedUrl = '';
    let capturedBody = '';
    __setAppriseFetcherForTests(async (url, init) => {
      capturedUrl = url;
      capturedBody = String((init as RequestInit).body);
      return { ok: true, status: 200, text: async () => '' };
    });
    await sendApprise('http://apprise:8000/notify/t', formatted);
    expect(capturedUrl).toBe('http://apprise:8000/notify/t');
    const payload = JSON.parse(capturedBody);
    expect(payload.title).toBe('t');
    expect(payload.body).toBe('b');
    expect(payload.type).toBe('info');
  });

  it('forwards level → type for success and failure', async () => {
    const bodies: string[] = [];
    __setAppriseFetcherForTests(async (_url, init) => {
      bodies.push(String((init as RequestInit).body));
      return { ok: true, status: 200, text: async () => '' };
    });
    await sendApprise('http://a', { ...formatted, level: 'success' });
    await sendApprise('http://a', { ...formatted, level: 'failure' });
    expect(JSON.parse(bodies[0]!).type).toBe('success');
    expect(JSON.parse(bodies[1]!).type).toBe('failure');
  });

  it('throws AppriseError on 5xx', async () => {
    __setAppriseFetcherForTests(async () => ({ ok: false, status: 503, text: async () => '' }));
    await expect(sendApprise('http://a', formatted)).rejects.toThrow(AppriseError);
    await expect(sendApprise('http://a', formatted)).rejects.toThrow(/HTTP 503/);
  });

  it('throws AppriseError on network failure', async () => {
    __setAppriseFetcherForTests(async () => {
      throw new Error('econnrefused');
    });
    await expect(sendApprise('http://a', formatted)).rejects.toThrow(/fetch failed/);
  });
});
