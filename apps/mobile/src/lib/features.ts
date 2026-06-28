/**
 * Build-time feature flags (mobile).
 *
 * `CLOUD_FEATURES_ENABLED` gates the optional cloud service surfaces (Cloud
 * connection + push notifications). It stays `false` until the cloud service is
 * deployed; flipping it back to `true` here (and in
 * `apps/web/src/lib/features.ts`) restores the settings nav entries with no
 * other changes.
 */
export const CLOUD_FEATURES_ENABLED = false;
