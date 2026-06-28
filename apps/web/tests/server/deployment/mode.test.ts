import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { detectDeploymentMode } from '@/server/deployment/mode';
import * as fs from 'node:fs';

vi.mock('node:fs', { spy: true });

describe('detectDeploymentMode', () => {
  const origEnv = process.env;
  beforeEach(() => {
    process.env = { ...origEnv };
    delete process.env.KUBERNETES_SERVICE_HOST;
  });
  afterEach(() => {
    process.env = origEnv;
    vi.restoreAllMocks();
  });

  it('returns kubernetes when KUBERNETES_SERVICE_HOST is set', () => {
    process.env.KUBERNETES_SERVICE_HOST = '10.0.0.1';
    expect(detectDeploymentMode()).toBe('kubernetes');
  });

  it('returns docker when /.dockerenv exists', () => {
    vi.spyOn(fs, 'existsSync').mockImplementation((p) => p === '/.dockerenv');
    expect(detectDeploymentMode()).toBe('docker');
  });

  it('returns standalone otherwise', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    expect(detectDeploymentMode()).toBe('standalone');
  });

  it('prefers kubernetes over docker when both signals present', () => {
    process.env.KUBERNETES_SERVICE_HOST = '10.0.0.1';
    vi.spyOn(fs, 'existsSync').mockImplementation((p) => p === '/.dockerenv');
    expect(detectDeploymentMode()).toBe('kubernetes');
  });
});
