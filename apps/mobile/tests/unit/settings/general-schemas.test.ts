import {
  UpdatesConfigResponse,
  AutoGrabResponse,
  MatcherWeightsResponse,
  AdultFilterResponse,
  JobRetentionResponse,
  BackupRetentionResponse,
  VisibilityRetentionResponse,
  ReleaseRetentionResponse,
} from '@/api/schemas/general';

describe('UpdatesConfigResponse', () => {
  it('parses a valid updates config', () => {
    const result = UpdatesConfigResponse.parse({
      config: {
        frequency: 'daily',
        behavior: 'notify',
        notifyOnIntegrations: true,
        showChangelogOnFirstLaunch: false,
      },
    });
    expect(result.config.frequency).toBe('daily');
    expect(result.config.behavior).toBe('notify');
    expect(result.config.notifyOnIntegrations).toBe(true);
    expect(result.config.showChangelogOnFirstLaunch).toBe(false);
  });
});

describe('AutoGrabResponse', () => {
  it('parses a valid auto-grab config', () => {
    const result = AutoGrabResponse.parse({ config: { dryRun: true } });
    expect(result.config.dryRun).toBe(true);
  });
});

describe('MatcherWeightsResponse', () => {
  it('parses a valid matcher weights response without autoReplayEnqueued', () => {
    const result = MatcherWeightsResponse.parse({
      config: {
        groupTopWeight: 100,
        groupStepDown: 10,
        batchBonus: 5,
        seederMultiplier: 1.5,
        trustedBonus: 20,
        remakePenalty: -50,
      },
    });
    expect(result.config.remakePenalty).toBe(-50);
    expect(result.autoReplayEnqueued).toBeUndefined();
  });

  it('parses autoReplayEnqueued with a runId', () => {
    const result = MatcherWeightsResponse.parse({
      config: {
        groupTopWeight: 100,
        groupStepDown: 10,
        batchBonus: 5,
        seederMultiplier: 1.5,
        trustedBonus: 20,
        remakePenalty: -50,
      },
      autoReplayEnqueued: { runId: 42 },
    });
    expect(result.autoReplayEnqueued).toEqual({ runId: 42 });
  });

  it('parses autoReplayEnqueued with an error', () => {
    const result = MatcherWeightsResponse.parse({
      config: {
        groupTopWeight: 100,
        groupStepDown: 10,
        batchBonus: 5,
        seederMultiplier: 1.5,
        trustedBonus: 20,
        remakePenalty: -50,
      },
      autoReplayEnqueued: { error: 'queue full' },
    });
    expect(result.autoReplayEnqueued).toEqual({ error: 'queue full' });
  });
});

describe('AdultFilterResponse', () => {
  it('parses a valid adult filter response', () => {
    const result = AdultFilterResponse.parse({
      config: { enabled: false, blockedCategories: ['hentai', 'doujin'] },
    });
    expect(result.config.enabled).toBe(false);
    expect(result.config.blockedCategories).toEqual(['hentai', 'doujin']);
  });
});

describe('JobRetentionResponse', () => {
  it('parses a valid job retention config', () => {
    const result = JobRetentionResponse.parse({
      config: { terminalDays: 30, errorDays: 7 },
    });
    expect(result.config.terminalDays).toBe(30);
    expect(result.config.errorDays).toBe(7);
  });
});

describe('BackupRetentionResponse', () => {
  it('parses a valid backup retention config', () => {
    const result = BackupRetentionResponse.parse({
      config: { daily: 7, monthlyDay1: 3 },
    });
    expect(result.config.daily).toBe(7);
    expect(result.config.monthlyDay1).toBe(3);
  });
});

describe('VisibilityRetentionResponse', () => {
  it('parses a valid visibility retention config', () => {
    const result = VisibilityRetentionResponse.parse({
      config: { auditRetentionDays: 90, logRetentionDays: 30 },
    });
    expect(result.config.auditRetentionDays).toBe(90);
    expect(result.config.logRetentionDays).toBe(30);
  });
});

describe('ReleaseRetentionResponse', () => {
  it('parses a valid release retention config', () => {
    const result = ReleaseRetentionResponse.parse({
      config: { keepPerSeries: 5, olderThanDays: 60 },
    });
    expect(result.config.keepPerSeries).toBe(5);
    expect(result.config.olderThanDays).toBe(60);
  });
});
