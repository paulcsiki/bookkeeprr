import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  sendDiscord,
  DiscordError,
  __setDiscordFetcherForTests,
  __resetDiscordForTests,
} from '@/server/notifications/discord';

const cfg = {
  webhookUrl: 'https://discord.com/api/webhooks/123/abc',
  username: 'my-bot',
  avatarUrl: 'https://example.com/a.png',
};

const formatted = {
  title: 't',
  body: 'b',
  color: 0xabcdef,
  level: 'info' as const,
};

beforeEach(() => __resetDiscordForTests());
afterEach(() => __resetDiscordForTests());

describe('sendDiscord', () => {
  it('POSTs the embed payload to the webhook URL', async () => {
    let capturedUrl = '';
    let capturedBody = '';
    __setDiscordFetcherForTests(async (url, init) => {
      capturedUrl = url;
      capturedBody = String((init as RequestInit).body);
      return { ok: true, status: 204, text: async () => '' };
    });
    await sendDiscord(cfg, formatted);
    expect(capturedUrl).toBe(cfg.webhookUrl);
    const payload = JSON.parse(capturedBody);
    expect(payload.username).toBe('my-bot');
    expect(payload.avatar_url).toBe('https://example.com/a.png');
    expect(payload.embeds[0].title).toBe('t');
    expect(payload.embeds[0].description).toBe('b');
    expect(payload.embeds[0].color).toBe(0xabcdef);
  });

  it('renders the rich embed (cover thumbnail+image, fields, release block)', async () => {
    let capturedBody = '';
    __setDiscordFetcherForTests(async (_url, init) => {
      capturedBody = String((init as RequestInit).body);
      return { ok: true, status: 204, text: async () => '' };
    });
    await sendDiscord(cfg, {
      title: 'Grabbed: Abhorsen',
      body: 'flat body',
      color: 0x3b82f6,
      level: 'info',
      embed: {
        title: 'Abhorsen — Garth Nix',
        eventLabel: 'Grabbed',
        overview: 'Sabriel must master the bells.',
        fields: [
          { name: 'Author', value: 'Garth Nix', inline: true },
          { name: 'Size', value: '2.1 MiB', inline: true },
        ],
        releaseTitle: 'Abhorsen Trilogy - Garth Nix',
        thumbnailUrl: 'https://covers.example/c.jpg',
        imageUrl: 'https://covers.example/c.jpg',
        url: null,
      },
    });
    const embed = JSON.parse(capturedBody).embeds[0];
    expect(embed.title).toBe('Abhorsen — Garth Nix'); // series title, not "Grabbed: …"
    expect(embed.description).toContain('Grabbed');
    expect(embed.description).toContain('Sabriel must master the bells.');
    expect(embed.thumbnail.url).toBe('https://covers.example/c.jpg');
    expect(embed.image.url).toBe('https://covers.example/c.jpg');
    const release = embed.fields.find((f: { name: string }) => f.name === 'Release');
    expect(release.value).toContain('```');
    expect(release.value).toContain('Abhorsen Trilogy - Garth Nix');
    expect(embed.fields.some((f: { name: string }) => f.name === 'Author')).toBe(true);
  });

  it('omits avatar_url when null', async () => {
    let capturedBody = '';
    __setDiscordFetcherForTests(async (_url, init) => {
      capturedBody = String((init as RequestInit).body);
      return { ok: true, status: 204, text: async () => '' };
    });
    await sendDiscord({ ...cfg, avatarUrl: null }, formatted);
    const payload = JSON.parse(capturedBody);
    expect(payload.avatar_url).toBeUndefined();
  });

  it('throws DiscordError on 4xx', async () => {
    __setDiscordFetcherForTests(async () => ({
      ok: false,
      status: 404,
      text: async () => 'not found',
    }));
    await expect(sendDiscord(cfg, formatted)).rejects.toThrow(DiscordError);
    await expect(sendDiscord(cfg, formatted)).rejects.toThrow(/HTTP 404/);
  });

  it('throws DiscordError on network failure', async () => {
    __setDiscordFetcherForTests(async () => {
      throw new Error('econnrefused');
    });
    await expect(sendDiscord(cfg, formatted)).rejects.toThrow(/fetch failed/);
  });
});
