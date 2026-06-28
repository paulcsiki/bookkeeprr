/**
 * react-native-track-player wiring for the audiobook reader.
 *
 * The native playback service must be registered at the JS entry point, BEFORE
 * `AppRegistry.registerComponent`, so the OS headless task can drive transport
 * from the lock screen / notification when the app is backgrounded. Register it
 * in `index.js`:
 *
 *   import TrackPlayer from 'react-native-track-player';
 *   import { PlaybackService } from './src/features/reader/lib/track-player-setup';
 *   TrackPlayer.registerPlaybackService(() => PlaybackService);
 *
 * That registration is native/CI-verified — it is a no-op in jest (TrackPlayer
 * is mocked) and cannot be exercised on this host (no emulator).
 */
import TrackPlayer, { Capability, Event, type AddTrack } from 'react-native-track-player';
import type { ReaderManifest } from '@/api/schemas';
import { resolveOffline } from './offline-download';

/**
 * A single audio track in the player queue. Network tracks carry the session
 * bearer; offline tracks play from a local `file://` URL and omit the header.
 */
export interface QueueTrack extends AddTrack {
  url: string;
  title: string;
  artist?: string;
  duration?: number;
  headers?: { Authorization: string };
}

/** The serving route a single audio file is fetched from. */
function audioUrl(serverUrl: string, fileId: number): string {
  return `${serverUrl}/api/reader/audio/${fileId}`;
}

/** Normalize a device path to a `file://` URI (idempotent). */
function toFileUri(path: string): string {
  return path.startsWith('file://') ? path : `file://${path}`;
}

/**
 * Build the TrackPlayer queue from a manifest's tracks. Pure (no native calls)
 * so it can be unit-tested: each track points at the bearer-authed serving
 * route and carries the volume title as the artist for the lock-screen.
 *
 * When `offlinePaths` is provided (a per-track list of on-device file paths,
 * track idx at index idx), the matching track plays from its local `file://`
 * copy and carries NO Authorization header (a local file is not fetched).
 */
export function buildQueue(
  manifest: ReaderManifest,
  serverUrl: string,
  token: string,
  offlinePaths?: string[] | null,
): QueueTrack[] {
  const tracks = manifest.tracks ?? [];
  return tracks.map((t, i) => {
    const local = offlinePaths?.[i];
    // resolveOffline() converts stored relative paths to absolute before toFileUri().
    const base: QueueTrack = {
      id: `track-${t.fileId}`,
      url: local ? toFileUri(resolveOffline(local)) : audioUrl(serverUrl, t.fileId),
      title: t.title ?? `Track ${i + 1}`,
      artist: manifest.author ?? manifest.title,
      album: manifest.title,
    };
    if (!local) base.headers = { Authorization: `Bearer ${token}` };
    if (t.durationSec != null && t.durationSec > 0) base.duration = t.durationSec;
    return base;
  });
}

let setupPromise: Promise<void> | null = null;

/**
 * Idempotently set up the player and its lock-screen capabilities. Repeated
 * calls share one in-flight setup; if `setupPlayer` rejects because the player
 * already exists (a hot-reload / remount), that's swallowed.
 */
export function setupTrackPlayer(): Promise<void> {
  if (setupPromise) return setupPromise;
  setupPromise = (async () => {
    try {
      await TrackPlayer.setupPlayer();
    } catch {
      // Already initialized (e.g. a remount) — safe to proceed to options.
    }
    await TrackPlayer.updateOptions({
      capabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.JumpForward,
        Capability.JumpBackward,
        Capability.SeekTo,
      ],
      compactCapabilities: [Capability.Play, Capability.Pause],
      forwardJumpInterval: 30,
      backwardJumpInterval: 15,
    });
  })();
  return setupPromise;
}

/** Reset the memoized setup (tests / teardown). */
export function resetTrackPlayerSetup(): void {
  setupPromise = null;
}

/**
 * The background playback service. Wires the lock-screen / remote transport
 * events back to the player. Registered natively (see the file header); a no-op
 * under jest. Device/CI-verified.
 */
export async function PlaybackService(): Promise<void> {
  TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());
  TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
  TrackPlayer.addEventListener(Event.RemoteJumpForward, (e) => TrackPlayer.seekBy(e.interval));
  TrackPlayer.addEventListener(Event.RemoteJumpBackward, (e) => TrackPlayer.seekBy(-e.interval));
  TrackPlayer.addEventListener(Event.RemoteSeek, (e) => TrackPlayer.seekTo(e.position));
}
