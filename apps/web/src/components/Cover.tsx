'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ContentType } from '@bookkeeprr/types';
import { CONTENT_TYPE_VAR, CONTENT_TYPE_LABEL } from '@bookkeeprr/ui';
import { cn } from '@/lib/utils';

type Props = {
  /** Image URL. When null/undefined or it fails to load, the tinted fallback shows. */
  src?: string | null;
  /** Drives the fallback tint + type label. */
  contentType: ContentType;
  /** Shown on the fallback card (omitted on tiny covers via container query). */
  title?: string | null;
  /** Image alt text. Defaults to the title; pass "" for decorative covers. */
  alt?: string;
  /** Classes for the root frame — sizing, rounding, borders live here. */
  className?: string;
  /** Hide the type label on the fallback (e.g. when a pill already shows it). */
  hideType?: boolean;
  /** Native <img> loading hint. Defaults to lazy. */
  loading?: 'lazy' | 'eager';
  /** Overlays (pills, badges, progress bars) painted above the image. */
  children?: React.ReactNode;
};

type Status = 'loading' | 'ok' | 'error';

// Hosts whose images we route through our /api/img proxy. MangaDex's CDN serves
// a placeholder for some direct browser hotlinks; the server-side proxy fetches
// the real cover (with a mangadex.org Referer) and streams it back. The
// NovelUpdates CDN is Cloudflare-gated, so the proxy fetches it with a
// FlareSolverr-obtained clearance cookie + matching User-Agent.
const PROXIED_HOSTS = new Set<string>([
  'uploads.mangadex.org',
  'cdn.novelupdates.com',
  'books.google.com',
  'books.googleusercontent.com',
]);

/** Rewrites allowlisted external cover URLs to go through the image proxy. */
export function proxiedSrc(src: string | null | undefined): string | null | undefined {
  if (!src) return src;
  try {
    if (PROXIED_HOSTS.has(new URL(src).host)) {
      return `/api/img?u=${encodeURIComponent(src)}`;
    }
  } catch {
    // Not an absolute URL (e.g. a local path) — leave as-is.
  }
  return src;
}

/**
 * Shared cover renderer. While the image loads a shimmer skeleton shows; once
 * loaded it fades in. If there's no URL or it fails, we fall back to a card
 * tinted by the content type (manga rose, comic amber, …) with the title and
 * a type label — so a missing cover still reads as "a <type> book", never a
 * blank box. The tint is a fixed content-type accent, not the themable
 * `--color-primary`, matching `<ContentTypePill>`.
 */
export function Cover({
  src,
  contentType,
  title,
  alt,
  className,
  hideType = false,
  loading = 'lazy',
  children,
}: Props): React.JSX.Element {
  const [status, setStatus] = useState<Status>(src ? 'loading' : 'error');
  const tint = `var(${CONTENT_TYPE_VAR[contentType]})`;
  // Allowlisted external covers load via our image proxy (see proxiedSrc).
  const resolvedSrc = proxiedSrc(src);
  const showImg = Boolean(resolvedSrc) && status !== 'error';

  // Reset when src *changes* — e.g. a placeholder `null` (→ status 'error') is
  // replaced by the real URL once data loads. Without this the stale 'error'
  // state permanently hides a now-valid cover.
  //
  // Guard against the initial mount: this effect always fires once on mount,
  // and on a warm cache the `imgRef` callback below has already upgraded status
  // to 'ok' (the cached image was `complete` at mount). Blindly resetting to
  // 'loading' here would clobber that, and since the cached image's `load`
  // event already fired, `onLoad` never refires — leaving the skeleton stuck
  // on top of a fully-loaded cover. Only reset on a genuine src change.
  const seenSrc = useRef<string | null | undefined>(src);
  useEffect(() => {
    if (seenSrc.current === src) return;
    seenSrc.current = src;
    setStatus(src ? 'loading' : 'error');
  }, [src]);

  // SSR'd / cached / hydrated images can finish loading before React attaches
  // onLoad — that already-fired `load` never repeats, leaving the skeleton stuck
  // on top of a fully-loaded cover. Two backstops close that race:
  //  1. A ref callback reads `complete` off the DOM the moment the <img> mounts.
  //  2. A post-paint effect re-checks `complete` (it can flip true between commit
  //     and paint) and attaches native load/error listeners as a fallback to
  //     React's synthetic onLoad, which hydration can miss.
  const imgElRef = useRef<HTMLImageElement | null>(null);
  const imgRef = useCallback((node: HTMLImageElement | null) => {
    imgElRef.current = node;
    if (node?.complete && node.naturalWidth > 0) setStatus('ok');
  }, []);
  useEffect(() => {
    if (status !== 'loading') return;
    const el = imgElRef.current;
    if (!el) return;
    if (el.complete && el.naturalWidth > 0) {
      setStatus('ok');
      return;
    }
    if (el.complete && el.naturalWidth === 0) {
      // A completed-but-zero-size image is a failed/blocked load.
      setStatus('error');
      return;
    }
    const onDone = (): void => setStatus('ok');
    const onFail = (): void => setStatus('error');
    el.addEventListener('load', onDone);
    el.addEventListener('error', onFail);
    return () => {
      el.removeEventListener('load', onDone);
      el.removeEventListener('error', onFail);
    };
  }, [status, resolvedSrc]);

  return (
    <div
      className={cn('cv', className)}
      style={{ ['--cv-tint' as string]: tint }}
    >
      {/* Fallback card — always underneath, revealed on error / no-src. */}
      <div className="cv-fb" aria-hidden={showImg}>
        {title ? <span className="cv-fb-title">{title}</span> : null}
        {!hideType ? <span className="cv-fb-type">{CONTENT_TYPE_LABEL[contentType]}</span> : null}
      </div>

      {/* Loading shimmer — only while the image is in flight. */}
      {showImg && status === 'loading' ? <div className="cv-skel skel" aria-hidden /> : null}

      {/* The real cover — fades in on load, removed from paint on error. */}
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={imgRef}
          src={resolvedSrc ?? undefined}
          alt={alt ?? title ?? ''}
          loading={loading}
          className={cn('cv-img', status === 'ok' && 'is-loaded')}
          onLoad={() => setStatus('ok')}
          onError={() => setStatus('error')}
        />
      ) : null}

      {children}
    </div>
  );
}
