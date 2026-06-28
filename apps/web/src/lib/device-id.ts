/**
 * Per-browser stable device identity (DS11f).
 *
 * A UUID is generated on first call and persisted to localStorage under
 * `bookkeeprr-device-id`. Subsequent calls return the same value for the
 * lifetime of the browser profile. SSR-safe: returns `''` when
 * `typeof window === 'undefined'`.
 */

const STORAGE_KEY = 'bookkeeprr-device-id';

/** Returns the stable device UUID for this browser, generating one if needed. */
export function getDeviceId(): string {
  if (typeof window === 'undefined') return '';
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return stored;
    const id = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, id);
    return id;
  } catch {
    // localStorage can be blocked by privacy settings; fall back gracefully.
    return '';
  }
}

/**
 * Derive a human-readable label from `navigator.userAgent`.
 *
 * Returns:
 * - `"Chrome on macOS"`, `"Firefox on Windows"`, `"Safari on iOS"`, etc.
 * - `"your browser"` as a fallback when the UA is too opaque to parse.
 *
 * This is intentionally best-effort; accuracy doesn't matter for UX.
 */
export function getDeviceName(): string {
  if (typeof navigator === 'undefined') return 'your browser';
  const ua = navigator.userAgent;

  // Detect OS
  let os = '';
  if (/iPhone|iPad|iPod/.test(ua)) {
    os = 'iOS';
  } else if (/Android/.test(ua)) {
    os = 'Android';
  } else if (/Macintosh/.test(ua)) {
    os = 'macOS';
  } else if (/Windows/.test(ua)) {
    os = 'Windows';
  } else if (/Linux/.test(ua)) {
    os = 'Linux';
  }

  // Detect browser — order matters: Edge/OPR must come before Chrome.
  let browser = '';
  if (/Edg\//.test(ua)) {
    browser = 'Edge';
  } else if (/OPR\//.test(ua)) {
    browser = 'Opera';
  } else if (/Chrome\//.test(ua)) {
    browser = 'Chrome';
  } else if (/Firefox\//.test(ua)) {
    browser = 'Firefox';
  } else if (/Safari\//.test(ua)) {
    browser = 'Safari';
  }

  if (browser && os) return `${browser} on ${os}`;
  if (browser) return browser;
  if (os) return `browser on ${os}`;
  return 'your browser';
}
