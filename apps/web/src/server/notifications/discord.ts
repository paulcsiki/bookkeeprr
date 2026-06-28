import type { FormattedNotification } from './format';

const RATE_LIMIT_MS = 2000;
let lastSentAt = 0;

export type DiscordWebhookConfig = {
  webhookUrl: string;
  username: string;
  avatarUrl: string | null;
};

export class DiscordError extends Error {
  constructor(
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'DiscordError';
  }
}

type FetcherResponse = { ok: boolean; status: number; text(): Promise<string> };
type Fetcher = (url: string, init: RequestInit) => Promise<FetcherResponse>;

const defaultFetcher: Fetcher = async (url, init) => {
  const r = await fetch(url, init);
  return { ok: r.ok, status: r.status, text: () => r.text() };
};
let activeFetcher: Fetcher = defaultFetcher;

export function __setDiscordFetcherForTests(f: Fetcher): void {
  activeFetcher = f;
}
export function __resetDiscordForTests(): void {
  activeFetcher = defaultFetcher;
  lastSentAt = 0;
}

// Discord embed limits we stay under: 25 fields, 1024 chars/field value, 4096
// chars/description. Our truncation in format.ts keeps values well below these.
type DiscordEmbed = {
  title: string;
  url?: string;
  description?: string;
  color: number;
  timestamp: string;
  fields?: { name: string; value: string; inline?: boolean }[];
  thumbnail?: { url: string };
  image?: { url: string };
};

/**
 * Build the Discord embed. When the formatted notification carries a rich
 * `embed` payload (grab/import/failure events with a series) we render the
 * Sonarr-style layout: title + event label, an overview, inline metadata
 * fields, a monospace release block, and the cover as both thumbnail and large
 * image. Otherwise (test / update-available) we fall back to title + body.
 */
function buildEmbed(formatted: FormattedNotification): DiscordEmbed {
  const timestamp = new Date().toISOString();
  const e = formatted.embed;
  if (!e) {
    return {
      title: formatted.title,
      description: formatted.body,
      color: formatted.color,
      timestamp,
    };
  }

  const fields = e.fields.map((f) => ({
    name: f.name,
    value: f.value.slice(0, 1024),
    inline: f.inline ?? true,
  }));
  if (e.releaseTitle) {
    fields.push({ name: 'Release', value: `\`\`\`\n${e.releaseTitle}\n\`\`\``, inline: false });
  }

  const description = [e.eventLabel, e.overview].filter(Boolean).join('\n\n').slice(0, 4096);

  return {
    title: e.title,
    url: e.url ?? undefined,
    description: description || undefined,
    color: formatted.color,
    timestamp,
    fields: fields.length > 0 ? fields.slice(0, 25) : undefined,
    thumbnail: e.thumbnailUrl ? { url: e.thumbnailUrl } : undefined,
    image: e.imageUrl ? { url: e.imageUrl } : undefined,
  };
}

export async function sendDiscord(
  cfg: DiscordWebhookConfig,
  formatted: FormattedNotification,
): Promise<void> {
  const wait = RATE_LIMIT_MS - (Date.now() - lastSentAt);
  if (wait > 0) {
    await new Promise((r) => setTimeout(r, wait));
  }
  lastSentAt = Date.now();

  const payload = {
    username: cfg.username,
    avatar_url: cfg.avatarUrl ?? undefined,
    embeds: [buildEmbed(formatted)],
  };

  let resp: FetcherResponse;
  try {
    resp = await activeFetcher(cfg.webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    throw new DiscordError('fetch failed', err);
  }
  if (!resp.ok) {
    throw new DiscordError(`HTTP ${resp.status}`);
  }
}
