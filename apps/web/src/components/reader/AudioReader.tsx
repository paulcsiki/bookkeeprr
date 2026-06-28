'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import type { AudioTrack, ReaderManifest } from '@bookkeeprr/types';
import { isContentType } from '@bookkeeprr/types';
import { Cover as CoverArt } from '@/components/Cover';
import { ReaderRoot } from './ReaderRoot';
import { useReaderTheme } from './ReaderContext';
import { ReaderTopBar } from './ReaderTopBar';
import { RestartToast } from './RestartToast';
import { TOCPanel } from './TOCPanel';
import { RIcon } from './icons';
import { inkA } from './lib/colors';
import { loadReaderSettings, saveReaderSettings } from './lib/reader-settings-storage';
import { useLocalStorage } from '@/components/hooks/useLocalStorage';
import type { ReaderChromeMode } from './SettingsSheet';
import { ensureReaderKeyframes } from './anim';
import {
  chapterAt,
  chapterIndexAt,
  chapterPositions,
  fmtTimecode,
  posFromClientX,
} from './lib/format';
import { audioPosition, audioSec } from './lib/position';
import {
  globalToTrack,
  totalDuration,
  trackToGlobal,
  type TimelineTrack,
} from './lib/audio-timeline';
import { useProgress } from './hooks/useProgress';
import { useReadingHeartbeat } from './hooks/useReadingHeartbeat';
import { useFullscreen } from './hooks/useFullscreen';
import { useReaderEscape } from './hooks/useReaderEscape';

export interface AudioReaderProps {
  manifest: ReaderManifest;
  compact?: boolean;
  /** Leave the reader (wired to the top bar's back chevron). */
  onBack?: () => void;
}

const SPEEDS = [0.8, 1, 1.2, 1.5, 1.75, 2] as const;
const SLEEP_OPTS = [0, 5, 15, 30, 45, 60] as const;
const COMMIT_INTERVAL_SEC = 4;

/** The audio URL for one track's backing file. */
function audioUrl(fileId: number): string {
  return `/api/reader/audio/${fileId}`;
}

/** Pseudo-waveform bar heights — deterministic, ported from the prototype. */
function waveformBars(): number[] {
  return Array.from(
    { length: 56 },
    (_, i) => 0.3 + 0.7 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.6)),
  );
}

/**
 * The audiobook player. A volume's `manifest.tracks` form one continuous
 * timeline; a single `<audio>` element plays the current track and we map its
 * `currentTime` to a global second via the pure timeline helpers. Progress is
 * committed as a 0..1 position with an `{ sec }` locator (throttled ~4s + on
 * pause). Wrapped in a `ReaderRoot` seeded to the `dark` theme.
 */
export function AudioReader({ manifest, compact = false, onBack }: AudioReaderProps) {
  return (
    <ReaderRoot
      initialTheme="dark"
      initialAuto={false}
      dataTestId="reader-audio"
      style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}
    >
      <AudioPlayer manifest={manifest} compact={compact} onBack={onBack} />
    </ReaderRoot>
  );
}

function AudioPlayer({
  manifest,
  compact,
  onBack,
}: {
  manifest: ReaderManifest;
  compact: boolean;
  onBack?: () => void;
}) {
  useReaderTheme(); // assert we're inside a ReaderRoot; tokens drive all color
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // At most one pending one-shot `loadedmetadata` handler may be registered at
  // a time. seekTo and onEnded both register one after switching tracks; if
  // both were pending they'd both fire on a single event (one seeks to an
  // offset, the other replays from 0 + double-plays). Holding the latest in a
  // ref and removing any prior one ensures only the most recent intent wins.
  const loadedHandlerRef = useRef<(() => void) | null>(null);

  /** Register a one-shot loadedmetadata handler, superseding any pending one. */
  const setLoadedHandler = useCallback((handler: () => void) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (loadedHandlerRef.current) {
      audio.removeEventListener('loadedmetadata', loadedHandlerRef.current);
    }
    const wrapped = () => {
      audio.removeEventListener('loadedmetadata', wrapped);
      if (loadedHandlerRef.current === wrapped) loadedHandlerRef.current = null;
      handler();
    };
    loadedHandlerRef.current = wrapped;
    audio.addEventListener('loadedmetadata', wrapped);
  }, []);

  // Clear any pending one-shot listener on unmount.
  useEffect(
    () => () => {
      const audio = audioRef.current;
      if (audio && loadedHandlerRef.current) {
        audio.removeEventListener('loadedmetadata', loadedHandlerRef.current);
      }
      loadedHandlerRef.current = null;
    },
    [],
  );

  const tracks: AudioTrack[] = useMemo(() => manifest.tracks ?? [], [manifest.tracks]);
  const timeline: TimelineTrack[] = tracks;
  const totalSec = useMemo(
    () => manifest.totalSec ?? (totalDuration(timeline) || 0),
    [manifest.totalSec, timeline],
  );

  const { position, commit, restartedFromFinish } = useProgress(manifest);
  const positionRef = useRef(position);
  positionRef.current = position;

  // The seed second comes from the manifest's audio locator when present,
  // else derived from the persisted 0..1 position.
  const seedLoc = manifest.progress.locator;
  const seedSec = seedLoc && 'sec' in seedLoc ? seedLoc.sec : audioSec(position, totalSec);

  const [globalSec, setGlobalSec] = useState(Math.max(0, seedSec));
  const globalRef = useRef(globalSec);
  globalRef.current = globalSec;

  const [trackIdx, setTrackIdx] = useState(() => globalToTrack(timeline, seedSec).trackIdx);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeedState] = useState(1);
  const [sleepMin, setSleepMin] = useState(0);
  const [sleepLeft, setSleepLeft] = useState(0);
  const [autoscroll, setAutoscrollState] = useState(true);

  // Hydrate the persisted playback rate + chapter auto-scroll once, after
  // mount (effect, not initializer — SSR-markup safety, see ReaderRoot). The
  // sleep timer is transient by design and never persisted.
  useEffect(() => {
    const stored = loadReaderSettings('audio');
    if (stored.rate !== undefined) setSpeedState(stored.rate);
    if (stored.autoscroll !== undefined) setAutoscrollState(stored.autoscroll);
  }, []);

  /** Set + persist the playback rate (a discrete pick from the speed chips). */
  const setSpeed = useCallback((value: number) => {
    setSpeedState(value);
    saveReaderSettings('audio', { rate: value });
  }, []);

  /** Set + persist the chapter-list auto-scroll toggle. */
  const setAutoscroll = useCallback((value: boolean) => {
    setAutoscrollState(value);
    saveReaderSettings('audio', { autoscroll: value });
  }, []);
  const [overlay, setOverlay] = useState<'toc' | 'opts' | null>(null);
  const [bookmarked, setBookmarked] = useState(false);
  const [flash, setFlash] = useState(restartedFromFinish);
  const [chromeMode] = useLocalStorage<ReaderChromeMode>('bookkeeprr.reader.chrome-mode', 'bar');

  const rootRef = useRef<HTMLDivElement>(null);
  const { fullscreen, toggleFullscreen } = useFullscreen(rootRef);

  // Escape backs out one layer: panel → fullscreen → exit reader.
  useReaderEscape({
    overlayOpen: overlay !== null,
    closeOverlay: () => setOverlay(null),
    onExit: () => onBack?.(),
    fullscreen,
  });

  const lastCommitRef = useRef(0);

  // Reading-stats heartbeat: active while playing. Units = whole minutes of
  // playback advanced since the previous heartbeat (audio's "units").
  const lastUnitSecRef = useRef(globalRef.current);
  const getAudioUnitDelta = useCallback((): number => {
    const advanced = globalRef.current - lastUnitSecRef.current;
    if (advanced <= 0) {
      lastUnitSecRef.current = globalRef.current;
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

  const pos = totalSec > 0 ? audioPosition(globalSec, totalSec) : 0;
  const chapter = chapterAt(manifest, pos);
  const curChapterIdx = chapterIndexAt(manifest, pos);

  useEffect(() => {
    ensureReaderKeyframes();
  }, []);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(false), 2600);
    return () => clearTimeout(t);
  }, [flash]);

  // --- Progress commit ----------------------------------------------------
  const commitSec = useCallback(
    (sec: number) => {
      const clamped = Math.max(0, Math.min(totalSec || sec, sec));
      commit(audioPosition(clamped, totalSec), { sec: clamped });
    },
    [commit, totalSec],
  );

  // --- Seeking ------------------------------------------------------------
  // Move the global playhead to `sec`, switching the loaded track if needed.
  // `andPlay` keeps playback running after a same-track seek.
  const seekTo = useCallback(
    (sec: number, andPlay?: boolean) => {
      const clamped = Math.max(0, Math.min(totalSec > 0 ? totalSec : sec, sec));
      const { trackIdx: nextTrack, offsetSec } = globalToTrack(timeline, clamped);
      setGlobalSec(clamped);
      globalRef.current = clamped;
      const audio = audioRef.current;
      if (nextTrack !== trackIdx) {
        // Switching tracks: swap the src, then seek + (re)play once loadable.
        setTrackIdx(nextTrack);
        if (audio) {
          const resume = andPlay ?? !audio.paused;
          setLoadedHandler(() => {
            audio.currentTime = offsetSec;
            if (resume) void audio.play();
          });
        }
      } else if (audio) {
        audio.currentTime = offsetSec;
        if (andPlay) void audio.play();
      }
      commitSec(clamped);
    },
    [timeline, trackIdx, totalSec, commitSec, setLoadedHandler],
  );

  // --- Transport ----------------------------------------------------------
  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      // Optimistic; the element's `play`/`pause` events reconcile the truth.
      setPlaying(true);
      void audio.play();
    } else {
      setPlaying(false);
      audio.pause();
    }
  }, []);

  const skip = useCallback(
    (deltaSec: number) => {
      seekTo(globalRef.current + deltaSec);
    },
    [seekTo],
  );

  const cycleSpeed = useCallback(() => {
    const i = SPEEDS.indexOf(speed as (typeof SPEEDS)[number]);
    setSpeed(SPEEDS[(i + 1) % SPEEDS.length] ?? 1);
  }, [speed, setSpeed]);

  // Keep the element's playbackRate in sync.
  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed;
  }, [speed, trackIdx]);

  // --- <audio> element events --------------------------------------------
  const onTimeUpdate = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const g = trackToGlobal(timeline, trackIdx, audio.currentTime);
    setGlobalSec(g);
    globalRef.current = g;
    const now = Date.now() / 1000;
    if (now - lastCommitRef.current >= COMMIT_INTERVAL_SEC) {
      lastCommitRef.current = now;
      commitSec(g);
    }
  }, [timeline, trackIdx, commitSec]);

  const onPlay = useCallback(() => setPlaying(true), []);
  const onPause = useCallback(() => {
    setPlaying(false);
    commitSec(globalRef.current);
  }, [commitSec]);

  const onEnded = useCallback(() => {
    // Advance to the next track until the last; then stop at the end.
    if (trackIdx < timeline.length - 1) {
      const next = trackIdx + 1;
      setTrackIdx(next);
      const audio = audioRef.current;
      if (audio) {
        setLoadedHandler(() => {
          audio.currentTime = 0;
          void audio.play();
        });
      }
    } else {
      setPlaying(false);
      commitSec(totalSec);
    }
  }, [trackIdx, timeline.length, totalSec, commitSec, setLoadedHandler]);

  // --- Sleep timer --------------------------------------------------------
  useEffect(() => {
    setSleepLeft(sleepMin > 0 ? sleepMin * 60 : 0);
  }, [sleepMin]);
  // Tick the sleep timer once per second while playing and armed. Depends only
  // on `playing` + whether the timer is armed (`sleepMin`); the per-tick value
  // lives in a functional updater (with a ref mirror) so the interval isn't
  // recreated every second. Pauses the audio when it reaches zero.
  useEffect(() => {
    if (!playing || sleepMin <= 0) return;
    const id = setInterval(() => {
      setSleepLeft((s) => {
        if (s <= 0) return 0;
        if (s <= 1) {
          audioRef.current?.pause();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [playing, sleepMin]);

  // --- Auto-scroll chapter list to current --------------------------------
  const listRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!autoscroll || !listRef.current) return;
    const container = listRef.current;
    const el = container.querySelector<HTMLElement>(`[data-ch="${curChapterIdx}"]`);
    if (el && typeof container.scrollTo === 'function') {
      container.scrollTo({
        top: el.offsetTop - container.clientHeight / 2 + el.clientHeight,
        behavior: 'smooth',
      });
    }
  }, [curChapterIdx, autoscroll]);

  // Jump to a chapter by 0..1 position (from TOC) or by its start second.
  const jumpToPosition = useCallback(
    (p: number) => {
      seekTo(audioSec(p, totalSec), playing);
    },
    [seekTo, totalSec, playing],
  );

  const chapters = manifest.chapters ?? [];
  const starts = chapterPositions(manifest);

  const currentTrack = tracks[trackIdx] ?? tracks[0];
  const currentFileId = currentTrack?.fileId ?? -1;

  const topInset = compact ? 46 : 8;

  // The chapter/track list — uses chapters when present, else the tracks.
  const ChapterList = (
    <div
      ref={listRef}
      style={{ overflowY: 'auto', flex: 1, minHeight: 0, padding: '0 2px' }}
    >
      <div
        className="font-mono"
        style={{
          fontSize: 9.5,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'var(--reader-faint)',
          margin: '4px 4px 8px',
        }}
      >
        {chapters.length > 0 ? `Chapters · ${chapters.length}` : `Tracks · ${tracks.length}`}
      </div>
      {chapters.length > 0
        ? chapters.map((c, i) => {
            const cur = i === curChapterIdx;
            const startSec = (starts[i] ?? 0) * totalSec;
            const endSec = chapters[i + 1] != null ? (starts[i + 1] ?? 1) * totalSec : totalSec;
            const done = globalSec >= endSec && !cur;
            return (
              <ListRow
                key={i}
                idx={i}
                dataCh={i}
                title={c.title}
                meta={fmtTimecode(Math.max(0, endSec - startSec) / 60)}
                current={cur}
                done={done}
                playing={playing}
                onClick={() => seekTo(Math.min(totalSec, startSec + 0.5), playing)}
              />
            );
          })
        : tracks.map((t, i) => {
            const cur = i === trackIdx;
            const done = i < trackIdx;
            return (
              <ListRow
                key={i}
                idx={i}
                dataCh={i}
                title={t.title ?? `Track ${i + 1}`}
                meta={fmtTimecode((t.durationSec ?? 0) / 60)}
                current={cur}
                done={done}
                playing={playing}
                onClick={() => seekTo(trackToGlobal(timeline, i, 0) + 0.5, playing)}
              />
            );
          })}
    </div>
  );

  const Controls = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <AudioScrubber pos={pos} totalSec={totalSec} onScrub={jumpToPosition} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button
          type="button"
          onClick={cycleSpeed}
          className="font-mono"
          aria-label="Playback speed"
          style={pillBtn()}
        >
          {speed}×
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 14 : 22 }}>
          <SkipBtn name="back15" label="Back 15 seconds" digits="15" onClick={() => skip(-15)} />
          <button
            type="button"
            onClick={togglePlay}
            aria-label={playing ? 'Pause' : 'Play'}
            style={{
              border: 'none',
              cursor: 'pointer',
              display: 'grid',
              placeItems: 'center',
              width: 64,
              height: 64,
              borderRadius: 99,
              background: 'var(--reader-accent)',
              color: 'var(--reader-page)',
              boxShadow: `0 8px 22px ${inkA(0.4)}`,
            }}
          >
            <RIcon name={playing ? 'pause' : 'play'} size={28} fill stroke={0} />
          </button>
          <SkipBtn name="fwd30" label="Forward 30 seconds" digits="30" onClick={() => skip(30)} />
        </div>
        <button
          type="button"
          onClick={() => setOverlay('opts')}
          className="font-mono"
          aria-label="Sleep timer"
          style={{ ...pillBtn(), color: sleepLeft > 0 ? 'var(--reader-accent)' : 'var(--reader-ink-soft)' }}
        >
          <RIcon
            name="timer"
            size={15}
            color={sleepLeft > 0 ? 'var(--reader-accent)' : 'var(--reader-ink-soft)'}
          />
          {sleepLeft > 0 ? fmtTimecode(sleepLeft / 60) : 'Sleep'}
        </button>
      </div>
    </div>
  );

  return (
    <div
      ref={rootRef}
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        background: 'var(--reader-page)',
        color: 'var(--reader-ink)',
        transition: 'background .3s',
      }}
    >
      {/* Real HTML5 audio element — one track at a time, swapped on advance. */}
      <audio
        ref={audioRef}
        src={currentFileId >= 0 ? audioUrl(currentFileId) : undefined}
        preload="metadata"
        onTimeUpdate={onTimeUpdate}
        onPlay={onPlay}
        onPause={onPause}
        onEnded={onEnded}
        style={{ display: 'none' }}
      />

      <ReaderTopBar
        manifest={manifest}
        chapter={chapter}
        compact={compact}
        bookmarked={bookmarked}
        onBack={onBack}
        onBookmark={() => setBookmarked((b) => !b)}
        onTOC={() => setOverlay('toc')}
        onSettings={() => setOverlay('opts')}
        onFullscreen={toggleFullscreen}
        fullscreen={fullscreen}
        topInset={topInset}
        floating={chromeMode === 'floating'}
      />

      {!compact ? (
        <div
          style={{
            position: 'absolute',
            top: topInset + 50,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 22,
              padding: '10px 40px 30px',
              borderRight: `1px solid var(--reader-line)`,
            }}
          >
            <Cover manifest={manifest} size={200} playing={playing} />
            <div style={{ textAlign: 'center' }}>
              <div
                className="font-display"
                style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--reader-ink)' }}
              >
                {manifest.title}
              </div>
              {manifest.author && (
                <div style={{ fontSize: 13.5, color: 'var(--reader-ink-soft)', marginTop: 4 }}>
                  {manifest.author}
                </div>
              )}
            </div>
            <div style={{ width: '100%', maxWidth: 380 }}>{Controls}</div>
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              padding: '22px 26px 26px',
              minHeight: 0,
            }}
          >
            {ChapterList}
          </div>
        </div>
      ) : (
        <div
          style={{
            position: 'absolute',
            top: topInset + 50,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            flexDirection: 'column',
            padding: '8px 20px 26px',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
            <Cover manifest={manifest} size={150} playing={playing} />
            <div style={{ textAlign: 'center' }}>
              <div
                className="font-display"
                style={{ fontSize: 19, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--reader-ink)' }}
              >
                {chapter ? chapter.title : manifest.title}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--reader-ink-soft)', marginTop: 3 }}>
                {manifest.title}
                {manifest.author ? ` · ${manifest.author}` : ''}
              </div>
            </div>
          </div>
          {Controls}
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              borderTop: `1px solid var(--reader-line)`,
              paddingTop: 10,
            }}
          >
            {ChapterList}
          </div>
        </div>
      )}

      {flash && <RestartToast onDismiss={() => setFlash(false)} compact={compact} />}

      {overlay === 'toc' && (
        <TOCPanel
          manifest={manifest}
          position={pos}
          compact={compact}
          side="right"
          onJump={jumpToPosition}
          onClose={() => setOverlay(null)}
        />
      )}
      {overlay === 'opts' && (
        <AudioOptsSheet
          compact={compact}
          speed={speed}
          sleepMin={sleepMin}
          autoscroll={autoscroll}
          onSpeed={setSpeed}
          onSleep={setSleepMin}
          onAutoscroll={setAutoscroll}
          onClose={() => setOverlay(null)}
        />
      )}
    </div>
  );
}

/** A round skip button with the seconds count overlaid (±15 / ±30). */
function SkipBtn({
  name,
  label,
  digits,
  onClick,
}: {
  name: string;
  label: string;
  digits: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      style={{
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        color: 'var(--reader-ink)',
        position: 'relative',
        display: 'grid',
        placeItems: 'center',
      }}
    >
      <RIcon name={name} size={30} />
      <span
        className="font-mono"
        style={{ position: 'absolute', fontSize: 8, fontWeight: 600, color: 'var(--reader-ink)', marginTop: 3 }}
      >
        {digits}
      </span>
    </button>
  );
}

/** One chapter/track row in the list. */
function ListRow({
  idx,
  dataCh,
  title,
  meta,
  current,
  done,
  playing,
  onClick,
}: {
  idx: number;
  dataCh: number;
  title: string;
  meta: string;
  current: boolean;
  done: boolean;
  playing: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-ch={dataCh}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        textAlign: 'left',
        border: 'none',
        cursor: 'pointer',
        borderRadius: 11,
        padding: '11px 12px',
        marginBottom: 2,
        background: current ? inkA(0.12) : 'transparent',
      }}
    >
      <span
        style={{
          width: 26,
          height: 26,
          borderRadius: 99,
          flexShrink: 0,
          display: 'grid',
          placeItems: 'center',
          background: current ? 'var(--reader-accent)' : 'transparent',
          color: current ? 'var(--reader-page)' : 'var(--reader-faint)',
          border: current ? 'none' : `1.5px solid ${inkA(0.2)}`,
        }}
      >
        {current && playing ? (
          <RIcon name="pause" size={12} fill stroke={0} />
        ) : done ? (
          <RIcon name="check" size={13} color="var(--reader-accent)" />
        ) : (
          <span className="font-mono" style={{ fontSize: 10 }}>
            {idx + 1}
          </span>
        )}
      </span>
      <span
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 13.5,
          fontWeight: current ? 600 : 450,
          color: current ? 'var(--reader-ink)' : 'var(--reader-ink-soft)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {title}
      </span>
      <span className="font-mono" style={{ fontSize: 10.5, color: 'var(--reader-faint)' }}>
        {meta}
      </span>
    </button>
  );
}

/** The cover artwork (or a token gradient placeholder) with an EQ pulse. */
function Cover({
  manifest,
  size,
  playing,
}: {
  manifest: ReaderManifest;
  size: number;
  playing: boolean;
}) {
  const coverType = isContentType(manifest.contentType) ? manifest.contentType : 'audiobook';
  return (
    <div
      style={{
        position: 'relative',
        width: size,
        aspectRatio: '2/3',
        borderRadius: 14,
        overflow: 'hidden',
        flexShrink: 0,
        boxShadow: `0 24px 60px ${inkA(0.5)}`,
        border: `1px solid ${inkA(0.2)}`,
      }}
    >
      <CoverArt
        className="absolute inset-0"
        src={manifest.coverUrl}
        contentType={coverType}
        title={manifest.title}
        alt=""
        hideType
      />
      {playing && (
        <div
          style={{
            position: 'absolute',
            bottom: 10,
            right: 10,
            display: 'flex',
            gap: 2.5,
            alignItems: 'flex-end',
            height: 16,
          }}
        >
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              style={{
                width: 3,
                borderRadius: 99,
                background: 'var(--reader-page)',
                height: '100%',
                animation: `rd-eq .9s ease-in-out ${i * 0.18}s infinite`,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** The waveform-style scrubber — pseudo-bars + pointer drag to seek. */
function AudioScrubber({
  pos,
  totalSec,
  onScrub,
}: {
  pos: number;
  totalSec: number;
  onScrub: (p: number) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const bars = useMemo(() => waveformBars(), []);

  const setFromEvent = useCallback(
    (clientX: number) => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      onScrub(posFromClientX(clientX, rect));
    },
    [onScrub],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      setFromEvent(e.clientX);
      const move = (ev: PointerEvent) => setFromEvent(ev.clientX);
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    },
    [setFromEvent],
  );

  const minutes = totalSec / 60;
  return (
    <div>
      <div
        ref={ref}
        onPointerDown={onPointerDown}
        style={{
          position: 'relative',
          height: 36,
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          cursor: 'pointer',
          touchAction: 'none',
        }}
      >
        {bars.map((h, i) => {
          const frac = (i + 0.5) / bars.length;
          const played = frac <= pos;
          return (
            <span
              key={i}
              style={{
                flex: 1,
                height: `${h * 100}%`,
                borderRadius: 99,
                background: played ? 'var(--reader-accent)' : inkA(0.2),
                transition: 'background .1s',
              }}
            />
          );
        })}
        <span
          style={{
            position: 'absolute',
            left: `${pos * 100}%`,
            top: 0,
            bottom: 0,
            width: 2,
            background: 'var(--reader-accent)',
            transform: 'translateX(-1px)',
          }}
        />
      </div>
      <div
        className="font-mono"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 8,
          fontSize: 11,
          color: 'var(--reader-ink-soft)',
        }}
      >
        <span>{fmtTimecode(pos * minutes)}</span>
        <span>-{fmtTimecode((1 - pos) * minutes)}</span>
      </div>
    </div>
  );
}

function pillBtn(): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    height: 34,
    padding: '0 14px',
    borderRadius: 99,
    border: `1px solid ${inkA(0.16)}`,
    background: 'transparent',
    color: 'var(--reader-ink-soft)',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  };
}

/** The playback options bottom sheet — speed, sleep timer, auto-scroll. */
function AudioOptsSheet({
  compact,
  speed,
  sleepMin,
  autoscroll,
  onSpeed,
  onSleep,
  onAutoscroll,
  onClose,
}: {
  compact: boolean;
  speed: number;
  sleepMin: number;
  autoscroll: boolean;
  onSpeed: (s: number) => void;
  onSleep: (m: number) => void;
  onAutoscroll: (v: boolean) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    ensureReaderKeyframes();
  }, []);

  const Sub = ({ children }: { children: React.ReactNode }) => (
    <div
      className="font-mono"
      style={{
        fontSize: 9.5,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: 'var(--reader-faint)',
        margin: '18px 0 9px',
      }}
    >
      {children}
    </div>
  );

  return (
    <div
      onClick={onClose}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 60,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        background: inkA(0.28),
        backdropFilter: 'blur(2px)',
        animation: 'rd-fade .2s ease',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--reader-chrome)',
          borderTop: `1px solid var(--reader-line)`,
          borderRadius: '20px 20px 0 0',
          padding: compact ? '10px 18px 30px' : '12px 22px 22px',
          maxWidth: compact ? 'none' : 460,
          width: '100%',
          margin: '0 auto',
          boxShadow: `0 -16px 40px ${inkA(0.18)}`,
          animation: 'rd-slide-up .26s cubic-bezier(.16,1,.3,1)',
        }}
      >
        <div
          style={{ width: 40, height: 4, borderRadius: 99, background: inkA(0.18), margin: '4px auto 8px' }}
        />
        <div className="font-display" style={{ fontSize: 16, fontWeight: 600, color: 'var(--reader-ink)' }}>
          Playback
        </div>

        <Sub>Speed</Sub>
        <div style={{ display: 'flex', gap: 6 }}>
          {SPEEDS.map((s) => {
            const on = speed === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => onSpeed(s)}
                className="font-mono"
                style={{
                  flex: 1,
                  height: 40,
                  borderRadius: 9,
                  border: `1px solid ${on ? 'var(--reader-accent)' : inkA(0.16)}`,
                  background: on ? 'var(--reader-accent)' : 'transparent',
                  color: on ? 'var(--reader-page)' : 'var(--reader-ink)',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {s}×
              </button>
            );
          })}
        </div>

        <Sub>Sleep timer</Sub>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {SLEEP_OPTS.map((m) => {
            const on = sleepMin === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => onSleep(m)}
                className="font-mono"
                style={{
                  flex: '1 0 28%',
                  height: 38,
                  borderRadius: 9,
                  border: `1px solid ${on ? 'var(--reader-accent)' : inkA(0.16)}`,
                  background: on ? inkA(0.12) : 'transparent',
                  color: on ? 'var(--reader-accent)' : 'var(--reader-ink-soft)',
                  fontSize: 11.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {m === 0 ? 'Off' : `${m}m`}
              </button>
            );
          })}
        </div>

        <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 10 }}>
          <RIcon name="list" size={15} color="var(--reader-ink-soft)" />
          <span style={{ flex: 1, fontSize: 13, color: 'var(--reader-ink)' }}>Auto-scroll chapter list</span>
          <button
            type="button"
            role="switch"
            aria-checked={autoscroll}
            aria-label="Auto-scroll chapter list"
            onClick={() => onAutoscroll(!autoscroll)}
            style={{
              width: 42,
              height: 24,
              borderRadius: 99,
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              position: 'relative',
              background: autoscroll ? 'var(--reader-accent)' : inkA(0.2),
              transition: 'background .15s',
            }}
          >
            <span
              style={{
                position: 'absolute',
                top: 3,
                left: autoscroll ? 21 : 3,
                width: 18,
                height: 18,
                borderRadius: 99,
                background: 'var(--reader-page)',
                transition: 'left .15s',
              }}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
