/**
 * Build-time feature flags.
 *
 * `CLOUD_FEATURES_ENABLED` gates the optional cloud service surfaces (Cloud
 * connection + mobile push notifications). It stays `false` until the cloud
 * service is deployed; flipping it back to `true` here (and in
 * `apps/mobile/src/lib/features.ts`) restores the nav entries and route access
 * with no other changes.
 */
export const CLOUD_FEATURES_ENABLED = false;
