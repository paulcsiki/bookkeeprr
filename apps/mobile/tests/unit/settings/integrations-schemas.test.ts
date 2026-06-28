import {
  AudiobookshelfConfig,
  CalibreConfig,
  LibraryListResponse,
  SyncTestResult,
  NotificationsConfig,
  NotificationsTestResult,
  INTEGRATIONS_SECRET_SENTINEL,
} from '@/api/schemas/integrations';

const MASK = '••••••••';

describe('AudiobookshelfConfig', () => {
  it('parses a fully-configured GET response (masked token)', () => {
    const result = AudiobookshelfConfig.parse({
      baseUrl: 'http://abs:13378',
      apiToken: MASK,
      libraryId: 'lib-001',
      contentTypes: ['audiobook'],
      enabled: true,
      configured: true,
    });
    expect(result.baseUrl).toBe('http://abs:13378');
    expect(result.apiToken).toBe(MASK);
    expect(result.libraryId).toBe('lib-001');
    expect(result.contentTypes).toEqual(['audiobook']);
    expect(result.enabled).toBe(true);
    expect(result.configured).toBe(true);
  });

  it('parses a default (unconfigured) GET response with nulls', () => {
    const result = AudiobookshelfConfig.parse({
      baseUrl: null,
      apiToken: null,
      libraryId: null,
      contentTypes: ['audiobook'],
      enabled: false,
      configured: false,
    });
    expect(result.apiToken).toBeNull();
    expect(result.configured).toBe(false);
  });

  it('accepts multiple contentTypes', () => {
    const result = AudiobookshelfConfig.parse({
      baseUrl: 'http://abs',
      apiToken: null,
      libraryId: null,
      contentTypes: ['audiobook', 'ebook'],
      enabled: false,
      configured: false,
    });
    expect(result.contentTypes).toEqual(['audiobook', 'ebook']);
  });
});

describe('CalibreConfig', () => {
  it('parses a fully-configured GET response (masked password)', () => {
    const result = CalibreConfig.parse({
      baseUrl: 'http://calibre:8080',
      username: 'admin',
      password: MASK,
      libraryId: '0',
      contentTypes: ['ebook'],
      enabled: true,
      configured: true,
    });
    expect(result.password).toBe(MASK);
    expect(result.configured).toBe(true);
  });

  it('parses unconfigured state (null baseUrl, null password)', () => {
    const result = CalibreConfig.parse({
      baseUrl: null,
      username: null,
      password: null,
      libraryId: '0',
      contentTypes: ['ebook'],
      enabled: false,
      configured: false,
    });
    expect(result.baseUrl).toBeNull();
    expect(result.password).toBeNull();
    expect(result.configured).toBe(false);
  });
});

describe('LibraryListResponse', () => {
  it('parses a libraries list', () => {
    const result = LibraryListResponse.parse({
      libraries: [
        { id: 'lib-1', name: 'Audiobooks', mediaType: 'book' },
        { id: 'lib-2', name: 'Podcasts', mediaType: 'podcast' },
      ],
    });
    expect(result.libraries).toHaveLength(2);
    const first = result.libraries[0]!;
    expect(first.id).toBe('lib-1');
    expect(first.name).toBe('Audiobooks');
    expect(first.mediaType).toBe('book');
  });

  it('parses an empty library list', () => {
    const result = LibraryListResponse.parse({ libraries: [] });
    expect(result.libraries).toEqual([]);
  });
});

describe('SyncTestResult', () => {
  it('parses ok:true success', () => {
    expect(SyncTestResult.parse({ ok: true }).ok).toBe(true);
  });

  it('parses error variant (502 body)', () => {
    const result = SyncTestResult.parse({ error: 'connection refused' });
    expect(result.error).toBe('connection refused');
    expect(result.ok).toBeUndefined();
  });

  it('accepts partial object (both ok and error undefined)', () => {
    expect(() => SyncTestResult.parse({})).not.toThrow();
  });
});

describe('NotificationsConfig', () => {
  it('parses a fully-configured GET response', () => {
    const result = NotificationsConfig.parse({
      discordWebhookUrl: MASK,
      discordWebhookConfigured: true,
      discordUsername: 'bookkeeprr',
      discordAvatarUrl: null,
      appriseUrl: MASK,
      appriseConfigured: true,
      eventGrabSuccess: true,
      eventImportSuccess: true,
      eventFailure: true,
      eventUpdateAvailable: false,
    });
    expect(result.discordWebhookUrl).toBe(MASK);
    expect(result.discordWebhookConfigured).toBe(true);
    expect(result.appriseConfigured).toBe(true);
    expect(result.eventUpdateAvailable).toBe(false);
  });

  it('parses a default (unconfigured) GET response', () => {
    const result = NotificationsConfig.parse({
      discordWebhookUrl: null,
      discordWebhookConfigured: false,
      discordUsername: 'bookkeeprr',
      discordAvatarUrl: null,
      appriseUrl: null,
      appriseConfigured: false,
      eventGrabSuccess: true,
      eventImportSuccess: true,
      eventFailure: true,
      eventUpdateAvailable: false,
    });
    expect(result.discordWebhookUrl).toBeNull();
    expect(result.appriseUrl).toBeNull();
  });
});

describe('NotificationsTestResult', () => {
  it('parses discord:ok + apprise:ok', () => {
    const result = NotificationsTestResult.parse({ discord: 'ok', apprise: 'ok' });
    expect(result.discord).toBe('ok');
    expect(result.apprise).toBe('ok');
  });

  it('parses discord:not-configured + apprise:not-configured', () => {
    const result = NotificationsTestResult.parse({
      discord: 'not-configured',
      apprise: 'not-configured',
    });
    expect(result.discord).toBe('not-configured');
    expect(result.apprise).toBe('not-configured');
  });

  it('parses error objects for both channels', () => {
    const result = NotificationsTestResult.parse({
      discord: { error: 'invalid webhook url' },
      apprise: { error: 'connection refused' },
    });
    expect(result.discord).toEqual({ error: 'invalid webhook url' });
    expect(result.apprise).toEqual({ error: 'connection refused' });
  });

  it('parses mixed: discord:ok + apprise error object', () => {
    const result = NotificationsTestResult.parse({
      discord: 'ok',
      apprise: { error: 'timeout' },
    });
    expect(result.discord).toBe('ok');
    expect(result.apprise).toEqual({ error: 'timeout' });
  });
});

describe('INTEGRATIONS_SECRET_SENTINEL', () => {
  it('exports the mask sentinel constant', () => {
    expect(INTEGRATIONS_SECRET_SENTINEL).toBe('••••••••');
  });
});
