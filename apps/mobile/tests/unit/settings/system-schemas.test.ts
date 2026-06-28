import { LogFilesResponse, LogTail } from '@/api/schemas/logs';
import {
  CloudSettings,
  CloudSettingsResponse,
  CloudDisconnectResponse,
  CloudTermsResponse,
} from '@/api/schemas/cloud';

it('parses log files + tail', () => {
  expect(LogFilesResponse.parse({ files: [{ name: 'a.log', sizeBytes: 10, mtime: 1 }] }).files[0]?.name).toBe('a.log');
  expect(LogTail.parse({ lines: ['{}'], totalBytes: 2, hasMore: true, nextBefore: 0 }).hasMore).toBe(true);
});

it('parses cloud settings', () => {
  const c = CloudSettings.parse({ enabled: true, cloudBaseUrl: 'https://c', tenantId: 't', installUuid: 'u', acceptedEulaVersion: '1', acceptedPrivacyVersion: '1', acceptedAt: '2026-01-01T00:00:00Z', lastRegisterError: null });
  expect(c.enabled).toBe(true);
  expect(CloudSettingsResponse.parse({ config: c }).config.tenantId).toBe('t');
  expect(CloudDisconnectResponse.parse({ devicesRemoved: 2, config: c }).devicesRemoved).toBe(2);
});

it('parses cloud terms', () => {
  const r = CloudTermsResponse.parse({
    terms: {
      eulaVersion: '2.1',
      eulaUrl: 'https://e',
      privacyVersion: '1.3',
      privacyUrl: 'https://p',
      effectiveAt: '2026-01-01T00:00:00Z',
    },
  });
  expect(r.terms.eulaVersion).toBe('2.1');
  expect(r.terms.privacyVersion).toBe('1.3');
});
