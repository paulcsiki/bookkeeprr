import { useCallback, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import Pdf from 'react-native-pdf';
import { useAuth } from '@/auth/AuthContext';
import { useOfflineSource, toFileUri } from '@/state/readerDownloadsStore';
import { resolveOffline } from './lib/offline-download';
import { useReadingProgress } from '@/api/hooks/useReadingProgress';
import { useReadingHeartbeat } from '@/api/hooks/useReadingHeartbeat';
import { parseReadableKey, type ReaderManifest } from '@/api/schemas';
import { useReaderTheme } from './ReaderThemeContext';
import { ReaderChrome } from './ReaderChrome';
import { ProgressRail } from './ProgressRail';
import { pageToPosition, positionToPage } from './lib/position';

export interface PdfReaderProps {
  manifest: ReaderManifest;
  /** Leave the reader — wired to the chrome's back chevron. */
  onBack: () => void;
}

/** Derive the libraryFileId a `page:file:<id>` readableKey addresses. */
function fileIdOf(readableKey: string): number {
  const parsed = parseReadableKey(readableKey);
  return parsed.kind === 'page' ? parsed.fileId : -1;
}

/**
 * The PDF reader: a native `react-native-pdf` view pulling the file from the
 * bearer-authed serving route `/api/reader/pdf/<fileId>`. Page ⇄ position runs
 * through `position.ts`; each page change debounce-commits the new position via
 * `useReadingProgress`. The reader owns its own chrome (top bar + progress rail)
 * so the surface is self-contained; the shell only seeds the theme.
 *
 * Native rendering + scroll/paging behavior is device/CI-verified — jest mocks
 * the native module to a View surfacing `source`/`onPageChanged`.
 */
export function PdfReader({ manifest, onBack }: PdfReaderProps) {
  const { palette } = useReaderTheme();
  const { state } = useAuth();
  const token = state.status === 'authenticated' ? state.creds.token : '';
  const serverUrl = state.status === 'authenticated' ? state.creds.serverUrl : '';

  const fileId = useMemo(() => fileIdOf(manifest.readableKey), [manifest.readableKey]);
  const pageCount = Math.max(1, manifest.pageCount ?? 1);

  const { progress, commit } = useReadingProgress(
    manifest.readableKey,
    {
      seriesId: manifest.seriesId,
      volumeId: manifest.volumeId ?? null,
      contentType: manifest.contentType,
    },
    manifest.progress,
  );

  // Seed the starting page (0-based) from the resume locator or the position.
  const seedIdx = (() => {
    const loc = progress?.locator;
    if (loc && 'page' in loc) return Math.min(Math.max(0, loc.page), pageCount - 1);
    return positionToPage(progress?.position ?? 0, pageCount);
  })();

  const [idx, setIdx] = useState(seedIdx);

  // Reading-stats heartbeat: active while mounted. Units = pages newly reached.
  const idxRef = useRef(idx);
  idxRef.current = idx;
  const lastUnitPageRef = useRef(idx);
  const getPageUnitDelta = useCallback((): number => {
    const delta = idxRef.current - lastUnitPageRef.current;
    if (delta <= 0) return 0;
    lastUnitPageRef.current = idxRef.current;
    return delta;
  }, []);
  useReadingHeartbeat({
    isActive: true,
    getUnitDelta: getPageUnitDelta,
    readableKey: manifest.readableKey,
  });

  // Prefer the offline-downloaded copy (a single `doc.pdf`) when present.
  // resolveOffline() converts stored relative paths to absolute before toFileUri().
  const offlinePaths = useOfflineSource(manifest.readableKey);
  const source = useMemo(() => {
    const local = offlinePaths?.[0];
    if (local) return { uri: toFileUri(resolveOffline(local)) };
    return {
      uri: `${serverUrl}/api/reader/pdf/${fileId}`,
      headers: { Authorization: `Bearer ${token}` },
    };
  }, [offlinePaths, serverUrl, fileId, token]);

  // `react-native-pdf` reports pages 1-based with the running total; map to a
  // 0-based index, update the rendered page, and debounce-commit the position.
  const onPageChanged = useCallback(
    (page: number, total: number) => {
      const count = Math.max(1, total);
      const zero = Math.min(Math.max(0, page - 1), count - 1);
      setIdx(zero);
      commit(pageToPosition(zero, count), { page: zero });
    },
    [commit],
  );

  const goIdx = useCallback(
    (n: number) => {
      const clamped = Math.min(Math.max(0, n), pageCount - 1);
      setIdx(clamped);
      commit(pageToPosition(clamped, pageCount), { page: clamped });
    },
    [commit, pageCount],
  );

  const position = pageToPosition(idx, pageCount);

  return (
    <View testID="reader-pdf" style={{ flex: 1, backgroundColor: palette.page }}>
      <ReaderChrome
        title={manifest.title}
        subtitle={manifest.volumeLabel ?? manifest.author ?? undefined}
        onBack={onBack}
      />
      <Pdf
        // `react-native-pdf` is 1-based for the `page` prop.
        page={idx + 1}
        source={source}
        onPageChanged={onPageChanged}
        style={{ flex: 1, backgroundColor: palette.page }}
      />
      <ProgressRail
        position={position}
        leftLabel={`Page ${idx + 1} / ${pageCount}`}
        rightLabel={`${Math.round(position * 100)}%`}
        onScrub={(p) => goIdx(positionToPage(p, pageCount))}
      />
    </View>
  );
}
