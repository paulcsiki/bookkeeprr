import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import FastImage from 'react-native-fast-image';
import TrackPlayer, {
  useProgress,
  useActiveTrack,
  usePlaybackState,
  State,
} from 'react-native-track-player';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react-native';
import { useAuth } from '@/auth/AuthContext';
import { useOfflineSource } from '@/state/readerDownloadsStore';
import { useReadingProgress } from '@/api/hooks/useReadingProgress';
import { useReadingHeartbeat } from '@/api/hooks/useReadingHeartbeat';
import type { ReaderManifest } from '@/api/schemas';
import { text } from '@/theme/typography';
import { useReaderTheme } from './ReaderThemeContext';
import { ReaderChrome } from './ReaderChrome';
import { ProgressRail } from './ProgressRail';
import { SettingsSheet } from './SettingsSheet';
import { TOCPanel, type TOCItem } from './TOCPanel';
import { audioPosition } from './lib/position';
import { loadReaderSettings, saveReaderSettings } from './lib/reader-settings';
import { globalToTrack, trackToGlobal, type TimelineTrack } from './lib/audio-timeline';
import { buildQueue, setupTrackPlayer } from './lib/track-player-setup';

export interface AudioReaderProps {
  manifest: ReaderManifest;
  /** Leave the reader — wired to the chrome's back chevron. */
  onBack: () => void;
}

type Overlay = 'settings' | 'toc' | null;

/** Playback rates the speed control cycles through. */
const RATES = [1, 1.25, 1.5, 1.75, 2, 0.75] as const;

/** Format a second count as `H:MM:SS` / `M:SS`. */
function fmt(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  const ss = String(r).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** A round transport button on the audio surface. */
function TransportButton({
  Icon,
  onPress,
  label,
  size,
  testID,
}: {
  Icon: LucideIcon;
  onPress: () => void;
  label: string;
  size: number;
  testID?: string;
}) {
  const { palette } = useReaderTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        width: size + 22,
        height: size + 22,
        borderRadius: 99,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Icon size={size} color={palette.ink} strokeWidth={1.8} />
    </Pressable>
  );
}

/**
 * The audiobook player. A volume's tracks form one continuous timeline; the
 * native `react-native-track-player` queue is built (bearer-authed) from
 * `manifest.tracks`, and the global position is mapped to/from the active
 * track via `audio-timeline.ts`.
 *
 * Transport: play/pause, skip ±15/30, a speed cycle (`setRate`), and a
 * countdown sleep timer that pauses on expiry. A chapter list jumps by seeking
 * to the track boundary. Progress is debounce-committed as `{ sec }`.
 *
 * Lock-screen / background playback is configured via TrackPlayer capabilities
 * in `track-player-setup.ts`; the playback service is registered natively (see
 * that file's header) and is device/CI-verified, not exercised in jest.
 */
export function AudioReader({ manifest, onBack }: AudioReaderProps) {
  const { palette } = useReaderTheme();
  const { state } = useAuth();
  const token = state.status === 'authenticated' ? state.creds.token : '';
  const serverUrl = state.status === 'authenticated' ? state.creds.serverUrl : '';

  const tracks = useMemo(() => manifest.tracks ?? [], [manifest.tracks]);
  const timeline: TimelineTrack[] = useMemo(
    () => tracks.map((t) => ({ durationSec: t.durationSec })),
    [tracks],
  );
  const totalSec = useMemo(() => {
    if (manifest.totalSec != null && manifest.totalSec > 0) return manifest.totalSec;
    return timeline.reduce(
      (acc, t) => acc + (t.durationSec && t.durationSec > 0 ? t.durationSec : 0),
      0,
    );
  }, [manifest.totalSec, timeline]);

  const { progress, commit } = useReadingProgress(
    manifest.readableKey,
    {
      seriesId: manifest.seriesId,
      volumeId: manifest.volumeId ?? null,
      contentType: manifest.contentType,
    },
    manifest.progress,
  );

  // Resume second: the locator's `sec` (or fall back to position × total).
  const seedSec = (() => {
    const loc = progress?.locator;
    if (loc && 'sec' in loc) return loc.sec;
    return (progress?.position ?? 0) * totalSec;
  })();

  const [overlay, setOverlay] = useState<Overlay>(null);
  const [chromeHidden, setChromeHidden] = useState(false);
  const [rate, setRate] = useState(1);
  const [sleepMinutes, setSleepMinutesState] = useState<number | null>(null);
  const [sleepLeftSec, setSleepLeftSec] = useState<number | null>(null);

  // Hydrate the persisted playback rate and apply it to the native player.
  // The sleep timer is deliberately session-scoped — never persisted.
  useEffect(() => {
    let cancelled = false;
    void loadReaderSettings('audio').then((s) => {
      if (cancelled || s.rate === undefined) return;
      setRate(s.rate);
      void TrackPlayer.setRate(s.rate);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Build the queue once, set the player up, enqueue, and seek to the resume
  // point. Keyed on the source identity (`readableKey` + auth) so it re-enqueues
  // only when the readable or credentials change, not on every progress tick.
  // The latest manifest/timeline/resume-second are read through refs so a stale
  // closure can't enqueue the wrong queue. All native calls are mocked in jest.
  // Per-track offline file paths (track idx at index idx) when downloaded, else
  // null — the queue then streams from the bearer-authed serving route.
  const offlinePaths = useOfflineSource(manifest.readableKey);
  const enqueueRef = useRef({ manifest, timeline, seedSec, offlinePaths });
  enqueueRef.current = { manifest, timeline, seedSec, offlinePaths };
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { manifest: m, timeline: tl, seedSec: seed, offlinePaths: paths } = enqueueRef.current;
      await setupTrackPlayer();
      if (cancelled) return;
      await TrackPlayer.reset();
      await TrackPlayer.add(buildQueue(m, serverUrl, token, paths));
      if (cancelled) return;
      const point = globalToTrack(tl, seed);
      if (point.trackIdx > 0) await TrackPlayer.skip(point.trackIdx);
      await TrackPlayer.seekTo(point.offsetSec);
    })();
    return () => {
      cancelled = true;
    };
    // Re-enqueue when the offline copy becomes available (paths flip non-null).
  }, [manifest.readableKey, serverUrl, token, offlinePaths]);

  // The active track index drives the global-position mapping.
  const activeTrack = useActiveTrack();
  const activeIdx = useMemo(() => {
    if (!activeTrack) return 0;
    const i = tracks.findIndex((t) => `track-${t.fileId}` === activeTrack.id);
    return i >= 0 ? i : 0;
  }, [activeTrack, tracks]);

  // Playback state from the NATIVE player — this reflects lock-screen /
  // notification RemotePlay/RemotePause as well as in-app transport, so the
  // play/pause icon and toggle logic stay in sync with what's actually playing
  // (a local boolean would drift the moment the user uses the lock screen).
  const playbackState = usePlaybackState();
  const playing = playbackState.state === State.Playing;

  // Per-track progress from the player → global second → normalized position.
  const { position: trackPos } = useProgress(500);
  const globalSec = trackToGlobal(timeline, activeIdx, trackPos);
  const position = audioPosition(globalSec, totalSec);

  // Throttle progress commits to roughly once per playback tick.
  const lastCommitRef = useRef(0);
  useEffect(() => {
    const now = Date.now();
    if (now - lastCommitRef.current < 4000) return;
    lastCommitRef.current = now;
    commit(position, { sec: globalSec });
  }, [position, globalSec, commit]);

  // Reading-stats heartbeat: active while playing. Units = whole listened
  // minutes advanced since the previous heartbeat.
  const globalSecRef = useRef(globalSec);
  globalSecRef.current = globalSec;
  const lastUnitSecRef = useRef(globalSec);
  const getAudioUnitDelta = useCallback((): number => {
    const advanced = globalSecRef.current - lastUnitSecRef.current;
    if (advanced <= 0) {
      lastUnitSecRef.current = globalSecRef.current;
      return 0;
    }
    const minutes = Math.floor(advanced / 60);
    if (minutes > 0) lastUnitSecRef.current += minutes * 60;
    return minutes;
  }, []);
  useReadingHeartbeat({
    isActive: playing,
    getUnitDelta: getAudioUnitDelta,
    readableKey: manifest.readableKey,
  });

  const togglePlay = useCallback(() => {
    // Drive the native player off the derived state; `usePlaybackState` then
    // re-renders the icon when the player actually transitions.
    if (playing) void TrackPlayer.pause();
    else void TrackPlayer.play();
  }, [playing]);

  const skipBy = useCallback(
    (delta: number) => {
      const target = Math.max(0, Math.min(totalSec, globalSec + delta));
      const point = globalToTrack(timeline, target);
      void (async () => {
        if (point.trackIdx !== activeIdx) await TrackPlayer.skip(point.trackIdx);
        await TrackPlayer.seekTo(point.offsetSec);
      })();
      commit(audioPosition(target, totalSec), { sec: target });
      // Restart the throttle window so the next periodic commit doesn't fire
      // immediately on top of this explicit seek-driven one.
      lastCommitRef.current = Date.now();
    },
    [totalSec, globalSec, timeline, activeIdx, commit],
  );

  const seekToGlobal = useCallback(
    (sec: number) => {
      const target = Math.max(0, Math.min(totalSec, sec));
      const point = globalToTrack(timeline, target);
      void (async () => {
        if (point.trackIdx !== activeIdx) await TrackPlayer.skip(point.trackIdx);
        await TrackPlayer.seekTo(point.offsetSec);
      })();
      commit(audioPosition(target, totalSec), { sec: target });
      // Restart the throttle window (see skipBy).
      lastCommitRef.current = Date.now();
    },
    [totalSec, timeline, activeIdx, commit],
  );

  const cycleRate = useCallback(() => {
    setRate((r) => {
      const i = RATES.indexOf(r as (typeof RATES)[number]);
      const next = RATES[(i + 1) % RATES.length] ?? 1;
      void TrackPlayer.setRate(next);
      saveReaderSettings('audio', { rate: next });
      return next;
    });
  }, []);

  // Sleep timer: arm a countdown that pauses playback on expiry.
  const setSleepMinutes = useCallback((m: number | null) => {
    setSleepMinutesState(m);
    setSleepLeftSec(m === null ? null : m * 60);
  }, []);

  useEffect(() => {
    if (sleepLeftSec === null) return;
    if (sleepLeftSec <= 0) {
      // Pausing flows back through `usePlaybackState`, so no local flag to clear.
      void TrackPlayer.pause();
      setSleepMinutesState(null);
      setSleepLeftSec(null);
      return;
    }
    const id = setTimeout(() => setSleepLeftSec((s) => (s === null ? null : s - 1)), 1000);
    return () => clearTimeout(id);
  }, [sleepLeftSec]);

  // Chapter list: prefer explicit chapter marks, else one entry per track.
  const trackStarts = useMemo(() => {
    const starts: number[] = [];
    let acc = 0;
    for (const t of timeline) {
      starts.push(acc);
      acc += t.durationSec && t.durationSec > 0 ? t.durationSec : 0;
    }
    return starts;
  }, [timeline]);

  const chapters = useMemo(() => {
    if (manifest.chapters && manifest.chapters.length > 0) {
      return manifest.chapters.map((c) => ({ title: c.title, sec: c.startSec ?? 0 }));
    }
    return tracks.map((t, i) => ({
      title: t.title ?? `Track ${i + 1}`,
      sec: trackStarts[i] ?? 0,
    }));
  }, [manifest.chapters, tracks, trackStarts]);

  const tocItems: TOCItem[] = useMemo(
    () => chapters.map((c) => ({ label: c.title, detail: fmt(c.sec) })),
    [chapters],
  );

  // Highlight the chapter whose start is the latest at/under the current second.
  const activeChapter = useMemo(() => {
    let idx = 0;
    for (let i = 0; i < chapters.length; i++) {
      if (globalSec >= (chapters[i]?.sec ?? 0)) idx = i;
    }
    return idx;
  }, [chapters, globalSec]);

  return (
    <View testID="reader-audio" style={{ flex: 1, backgroundColor: palette.page }}>
      {!chromeHidden ? (
        <ReaderChrome
          title={manifest.title}
          subtitle={manifest.volumeLabel ?? manifest.author ?? undefined}
          onBack={onBack}
          onTOC={tocItems.length > 0 ? () => setOverlay('toc') : undefined}
          onSettings={() => setOverlay('settings')}
          settingsIcon={SlidersHorizontal}
          settingsLabel="Playback"
        />
      ) : null}

      <Pressable
        onPress={() => setChromeHidden((h) => !h)}
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 28,
          gap: 22,
        }}
      >
        {manifest.coverUrl ? (
          <FastImage
            testID="reader-audio-cover"
            source={{ uri: manifest.coverUrl, headers: { Authorization: `Bearer ${token}` } }}
            resizeMode={FastImage.resizeMode.contain}
            style={{ width: 220, height: 300, borderRadius: 12 }}
          />
        ) : (
          <View
            testID="reader-audio-cover-placeholder"
            style={{
              width: 220,
              height: 300,
              borderRadius: 12,
              backgroundColor: palette.chrome2,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={[text.displayMd, { color: palette.faint }]}>{manifest.title}</Text>
          </View>
        )}

        <Text
          numberOfLines={2}
          style={[text.displayMd, { color: palette.ink, textAlign: 'center' }]}
        >
          {chapters[activeChapter]?.title ?? manifest.title}
        </Text>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
          <TransportButton
            testID="reader-audio-back15"
            Icon={RotateCcw}
            onPress={() => skipBy(-15)}
            label="Back 15 seconds"
            size={26}
          />
          <TransportButton
            testID="reader-audio-playpause"
            Icon={playing ? Pause : Play}
            onPress={togglePlay}
            label={playing ? 'Pause' : 'Play'}
            size={40}
          />
          <TransportButton
            testID="reader-audio-fwd30"
            Icon={RotateCw}
            onPress={() => skipBy(30)}
            label="Forward 30 seconds"
            size={26}
          />
        </View>

        {sleepLeftSec !== null ? (
          <Text testID="reader-audio-sleep" style={[text.monoSm, { color: palette.accent }]}>
            Sleep in {fmt(sleepLeftSec)}
          </Text>
        ) : null}
      </Pressable>

      {!chromeHidden ? (
        <ProgressRail
          position={position}
          leftLabel={fmt(globalSec)}
          rightLabel={fmt(totalSec)}
          onScrub={(p) => seekToGlobal(p * totalSec)}
        />
      ) : null}

      {overlay === 'settings' ? (
        <View testID="reader-overlay-settings" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          <SettingsSheet
            onDismiss={() => setOverlay(null)}
            audioOptions={{ rate, cycleRate, sleepMinutes, setSleepMinutes }}
          />
        </View>
      ) : null}

      {overlay === 'toc' ? (
        <View testID="reader-overlay-toc" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          <TOCPanel
            items={tocItems}
            activeIndex={activeChapter}
            onDismiss={() => setOverlay(null)}
            onJump={(i) => {
              seekToGlobal(chapters[i]?.sec ?? 0);
              setOverlay(null);
            }}
          />
        </View>
      ) : null}
    </View>
  );
}
