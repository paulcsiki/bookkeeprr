import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, Alert } from 'react-native';
import { AudioReader } from '@/features/reader/AudioReader';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { RouteProp } from '@react-navigation/native';
import { useReaderManifest, type ReaderManifestParams } from '@/api/hooks/useReaderManifest';
import { useSeries } from '@/api/hooks/useSeries';
import {
  useOfflineSource,
  useReaderDownloads,
  downloadReadable,
} from '@/state/readerDownloadsStore';
import { removeOfflineReadable } from '@/features/reader/lib/offline-download';
import { loadOfflineSettings } from '@/features/reader/lib/offline-settings';
import { buildReadableKey } from '@/api/schemas';
import { useIsOnline } from '@/features/system/online';
import { useAuth } from '@/auth/AuthContext';
import type { ContentType } from '@/api/schemas';

/** Map the server reader content-type to the mobile pill/content type. */
function toMobileType(c: ReaderContentType): ContentType {
  if (c === 'light_novel') return 'novel';
  if (c === 'audiobook') return 'audio';
  return c;
}
import type { AppTabsParamList } from '@/navigation/types';
import { usePeers } from '@/api/hooks/usePeers';
import { usePace } from '@/api/hooks/usePace';
import { text } from '@/theme/typography';
import { useTokens } from '@/theme/ThemeProvider';
import type { ReaderContentType, ReaderManifest } from '@/api/schemas';
import type { ReaderThemeKey } from '@/theme/reader-themes';
import type { LibraryStackParamList } from '@/navigation/types';
import { ReaderThemeProvider } from '@/features/reader/ReaderThemeContext';
import { ComicsReader } from '@/features/reader/ComicsReader';
import { TextReader } from '@/features/reader/TextReader';
import { FinishedView } from '@/features/reader/FinishedView';
import { HandoffCard } from '@/features/reader/HandoffCard';
import { getDeviceId } from '@/lib/device-id';

/**
 * The reader-page theme each content type seeds with on entry. Comics read best
 * on a pure-black surface (OLED), prose on warm Paper, audio on Dark.
 */
function seedTheme(contentType: ReaderContentType): ReaderThemeKey {
  switch (contentType) {
    case 'manga':
    case 'comic':
      return 'oled';
    case 'audiobook':
      return 'dark';
    case 'light_novel':
    case 'ebook':
    default:
      return 'paper';
  }
}

/**
 * The dispatch surface, rendered inside the reader-theme provider so the chrome
 * and the reader components share one palette. Dispatches by `manifest.reader`
 * to the player. Each reader (`ComicsReader`, `TextReader`, `AudioReader`) owns
 * its own chrome (top bar / progress rail / settings / TOC), so every branch
 * returns the full surface; the shell only seeds the theme.
 *
 * When the book was previously finished and the user hasn't restarted in this
 * session, shows the FinishedView celebration screen instead.
 */
const HANDOFF_THRESHOLD = 0.05;

function syncedAgo(updatedAt: string): string {
  const diffMs = Date.now() - new Date(updatedAt).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return `${Math.floor(diffH / 24)}d ago`;
}

function ReaderSurface({ manifest, onBack }: { manifest: ReaderManifest; onBack: () => void }) {
  const [sessionRestarted, setSessionRestarted] = useState(false);
  const [handoffDismissed, setHandoffDismissed] = useState(false);
  const [peerPosition, setPeerPosition] = useState<number | null>(null);
  const deviceIdRef = useRef('');

  useEffect(() => {
    void getDeviceId().then((id) => { deviceIdRef.current = id; });
  }, []);

  const localPosition = peerPosition ?? manifest.progress.position;
  const { peers } = usePeers(manifest.readableKey, deviceIdRef.current);
  const { paceLabel } = usePace();

  const navigation = useNavigation<NativeStackNavigationProp<LibraryStackParamList>>();
  const seriesQ = useSeries(manifest.seriesId);
  const offlinePaths = useOfflineSource(manifest.readableKey);
  const online = useIsOnline();
  const { state: authState } = useAuth();

  // Leave the reader for the Home dashboard — used by the finish prompts and the
  // "waiting for server" overlay's Cancel action.
  const goHome = useCallback(() => {
    navigation
      .getParent<BottomTabNavigationProp<AppTabsParamList>>()
      ?.navigate('Home' as never);
  }, [navigation]);

  // Reached the end of the book (paged forward past the last page). Auto-delete
  // the offline copy (it's been read), then prompt to continue to the next
  // volume. Declining ("Not now") leaves the reader for the home page rather
  // than dropping back onto the finished page.
  const onReachedEnd = useCallback(() => {
    if (offlinePaths !== null) {
      void removeOfflineReadable(manifest.readableKey);
      useReaderDownloads.getState().remove(manifest.readableKey);
    }
    const vols = seriesQ.data?.volumesList ?? [];
    const i = vols.findIndex((v) => v.id === manifest.volumeId);
    const nextVol = i >= 0 ? vols[i + 1] : undefined;
    if (nextVol) {
      const params =
        manifest.reader === 'audio'
          ? { volumeId: String(nextVol.id) }
          : nextVol.libraryFileId != null
            ? { fileId: String(nextVol.libraryFileId) }
            : { volumeId: String(nextVol.id) };

      // "Auto-download next in series": when enabled, pre-fetch the next volume
      // so it's ready offline. Best-effort + background; the disk-space guard in
      // the store still applies.
      if (authState.status === 'authenticated') {
        const nextKey =
          manifest.reader === 'audio'
            ? buildReadableKey({ kind: 'audio', volumeId: nextVol.id })
            : nextVol.libraryFileId != null
              ? buildReadableKey({ kind: 'page', fileId: nextVol.libraryFileId })
              : null;
        if (nextKey) {
          const creds = authState.creds;
          void loadOfflineSettings().then((s) => {
            if (!s.autoDownloadNext) return;
            if (!online) return; // offline: skip the background pre-fetch silently
            void downloadReadable(nextKey, {
              serverUrl: creds.serverUrl,
              token: creds.token,
              contentType: toMobileType(manifest.contentType),
              ...(nextVol.title ? { title: nextVol.title } : {}),
              volumeLabel: `Vol. ${nextVol.number}`,
            });
          });
        }
      }

      Alert.alert('Volume finished', `Continue to ${nextVol.title ?? 'the next volume'}?`, [
        { text: 'Not now', style: 'cancel', onPress: goHome },
        // `replace`, not `push`: swap the finished volume's reader for the next
        // one in place so the stack depth stays constant. Pushing would leave
        // every finished volume on the stack, and the back chevron would then
        // walk back through each previously-read volume instead of exiting.
        { text: 'Next volume', onPress: () => navigation.replace('Reader', params) },
      ]);
    } else {
      Alert.alert('Series finished', 'You’ve reached the end of this series.', [
        { text: 'Stay', style: 'cancel' },
        { text: 'Back to home', onPress: goHome },
      ]);
    }
  }, [manifest, offlinePaths, seriesQ.data, navigation, goHome, authState, online]);

  const isFinished =
    manifest.progress.finished &&
    !manifest.progress.restartedFromFinish &&
    !sessionRestarted;

  if (isFinished) {
    return (
      <FinishedView
        manifest={manifest}
        stats={{
          finishedAt: new Date(),
          minutesRead: 0,
          pages: manifest.pageCount ?? 0,
          paceLabel,
        }}
        onStartOver={() => setSessionRestarted(true)}
        onBackToLibrary={onBack}
      />
    );
  }

  const leadingPeer = !handoffDismissed
    ? peers.find((p) => p.position > localPosition + HANDOFF_THRESHOLD)
    : undefined;

  const readerEl = manifest.reader === 'comics'
    ? <ComicsReader manifest={manifest} onBack={onBack} onReachedEnd={onReachedEnd} onExitToHome={goHome} />
    : manifest.reader === 'text'
    ? <TextReader manifest={manifest} onBack={onBack} />
    : <AudioReader manifest={manifest} onBack={onBack} />;

  return (
    <View style={{ flex: 1 }}>
      {leadingPeer && (
        <View style={{ zIndex: 50, paddingHorizontal: 16, paddingTop: 12 }}>
          <HandoffCard
            deviceName={leadingPeer.deviceName ?? 'another device'}
            position={leadingPeer.position}
            lastSyncedAgo={syncedAgo(leadingPeer.updatedAt)}
            onResume={() => {
              setPeerPosition(leadingPeer.position);
              setHandoffDismissed(true);
            }}
          />
        </View>
      )}
      {readerEl}
    </View>
  );
}

/**
 * Full-screen reader route. Reads `volumeId`/`fileId` route params (strings →
 * numbers), fetches the manifest, renders themed loading + error states, and on
 * success wraps the dispatch surface in a reader-theme provider seeded by the
 * content type. `onBack` pops the modal.
 */
export default function Reader() {
  const route = useRoute<RouteProp<LibraryStackParamList, 'Reader'>>();
  const navigation = useNavigation<NativeStackNavigationProp<LibraryStackParamList>>();
  const t = useTokens();
  const [onBack] = useState(() => () => navigation.goBack());

  const params: ReaderManifestParams = {};
  if (route.params?.volumeId !== undefined) params.volumeId = Number(route.params.volumeId);
  else if (route.params?.fileId !== undefined) params.fileId = Number(route.params.fileId);

  const q = useReaderManifest(params);

  if (q.isLoading || (!q.data && !q.isError)) {
    return (
      <View
        testID="reader-loading"
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg }}
      >
        <ActivityIndicator color={t.primary} />
      </View>
    );
  }

  if (q.isError || !q.data) {
    return (
      <View
        testID="reader-error"
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: t.bg,
          paddingHorizontal: 24,
        }}
      >
        <Text style={[text.body, { color: t.err, textAlign: 'center' }]}>
          Could not open this reader.
        </Text>
      </View>
    );
  }

  return (
    <ReaderThemeProvider kind={q.data.reader} initialThemeKey={seedTheme(q.data.contentType)}>
      <ReaderSurface manifest={q.data} onBack={onBack} />
    </ReaderThemeProvider>
  );
}
