// Vitest global setup.
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Silence pino warn-level logs from intentional failure-path tests
// (e.g. federatedLookup provider-down scenarios). Tests deliberately
// exercise log.warn paths; surfacing them at default `info` floods
// test output with multi-KB stack traces that drown real signals.
// `error` is high enough to still surface unexpected bugs.
if (!process.env.BOOKKEEPRR_LOG_LEVEL) {
  process.env.BOOKKEEPRR_LOG_LEVEL = 'error';
}

// jsdom lacks ResizeObserver, which Radix primitives (Checkbox/Select size
// hooks) require at render time. Provide a no-op polyfill so component tests
// can mount them.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof ResizeObserver;
}

afterEach(() => {
  cleanup();
});
