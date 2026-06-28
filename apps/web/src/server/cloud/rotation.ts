import { logger } from '@/server/logger';
import { cloudSettings } from '@/server/db/settings/cloud';
import { CloudClient } from './client';
import { signTenantJWTWithKeypair } from './jwt';
import { rotateKeypairWithBackup, commitRotation, revertRotation } from './key';

function configDir(): string {
  return process.env.BOOKKEEPRR_CONFIG_DIR ?? '/config';
}

function fqdn(): string {
  return process.env.BOOKKEEPRR_PUBLIC_FQDN ?? 'bookkeeprr.local';
}

export type RotateKeyResult =
  | { status: 'skipped'; reason: string }
  | { status: 'rotated'; oldKid: string; newKid: string }
  | { status: 'failed'; oldKid: string; newKid: string; error: string };

/**
 * Rotate this installation's cloud signing keypair and notify the cloud via
 * PATCH /v1/tenants/{id}/key.
 *
 * Atomicity:
 *  - The old keypair is preserved as `cloud_keypair.json.prev` until the
 *    cloud confirms acceptance.
 *  - On cloud rejection (any non-2xx or thrown error), the previous keypair
 *    is restored from `.prev` so subsequent push / exchange calls keep
 *    working against the cloud's record.
 *
 * No-ops (returns `skipped`) when cloud is not connected (`enabled=false`
 * or no `tenantId`) — rotation is only meaningful for registered tenants.
 *
 * The access-token cache is invalidated regardless of success: even on
 * failure we'd rather re-exchange with the restored old key than risk
 * using a token tied to a kid the cloud may no longer recognise.
 */
export async function rotateKey(): Promise<RotateKeyResult> {
  const log = logger().child({ component: 'cloud-key-rotation' });
  const cfg = await cloudSettings.get();
  if (!cfg.enabled || !cfg.tenantId) {
    log.info('cloud not connected; skipping key rotation');
    return { status: 'skipped', reason: 'cloud_not_connected' };
  }

  const { oldKeypair, newKeypair } = await rotateKeypairWithBackup(configDir());
  log.info({ oldKid: oldKeypair.kid, newKid: newKeypair.kid }, 'rotating cloud key');

  // Sign the rotate JWT with the OLD key — the cloud still has the old
  // public_jwk on record and validates this bearer against it.
  const oldKeyJwt = await signTenantJWTWithKeypair(oldKeypair, {
    iss: fqdn(),
    sub: cfg.installUuid,
  });

  const client = new CloudClient(cfg.cloudBaseUrl, configDir());
  try {
    await client.rotateKey({
      tenantId: cfg.tenantId,
      oldKeyJwt,
      newPublicJwk: newKeypair.publicJwk,
    });
    await commitRotation(configDir());
    // Invalidate the cached access token; the next exchange will re-sign
    // with the new kid.
    await cloudSettings.set({
      accessToken: null,
      accessTokenExpiresAt: null,
      lastRegisterError: null,
    });
    log.info({ newKid: newKeypair.kid }, 'cloud key rotation committed');
    return { status: 'rotated', oldKid: oldKeypair.kid, newKid: newKeypair.kid };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const restored = await revertRotation(configDir());
    if (restored) {
      log.warn({ err: message }, 'cloud key rotation failed; reverted to old keypair');
    } else {
      log.error({ err: message }, 'cloud key rotation failed AND revert failed (no .prev on disk)');
    }
    await cloudSettings.set({ lastRegisterError: `key_rotation: ${message}` });
    return {
      status: 'failed',
      oldKid: oldKeypair.kid,
      newKid: newKeypair.kid,
      error: message,
    };
  }
}
