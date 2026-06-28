// Cached profile (identity + a locally-downloaded avatar) tracked in a zustand
// store and persisted to AsyncStorage so the Home greeting renders the real
// name + avatar instantly — and correctly OFFLINE — with no network at paint
// time. The derivation / mutation logic lives in the pure `reduce*`/
// `shouldRefreshProfile` helpers below so it's unit-testable without the store;
// the store is a thin wrapper that applies a reducer. The side-effecting refresh
// (fetch /api/mobile/me + download the avatar to disk) lives in `refreshProfile`.
//
// Project rule: reducers never call Date.now()/Math.random() — the current time
// is injected (`now`), keeping the units pure. Timestamps (`fetchedAt`) are
// stamped by the side-effecting caller.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

export const PROFILE_STORAGE_KEY = 'profile/v1';
/** Min gap between profile refreshes (mirrors the connectivity ping throttle). */
export const PROFILE_REFRESH_MIN_INTERVAL_MS = 5 * 60_000;

export interface ProfileState {
  id: number | null;
  username: string | null;
  displayName: string | null;
  email: string | null;
  /** Server-relative avatar route, when set (e.g. /api/auth/me/avatar/7). */
  avatarUrl: string | null;
  /** On-device path of the cached avatar image (rendered with no network). */
  avatarLocalPath: string | null;
  /** Epoch ms of the last successful identity fetch (throttle guard; 0 = never). */
  fetchedAt: number;
}

export interface Identity {
  id: number;
  username: string;
  displayName: string | null;
  email: string | null;
  avatarUrl: string | null;
}

// ---------------------------------------------------------------------------
// Pure reducers (no store/storage; return a NEW state).
// ---------------------------------------------------------------------------

/** Replace identity fields + stamp fetchedAt; PRESERVE the cached local image. */
export function reduceSetIdentity(s: ProfileState, id: Identity, now: number): ProfileState {
  return {
    ...s,
    id: id.id,
    username: id.username,
    displayName: id.displayName,
    email: id.email,
    avatarUrl: id.avatarUrl,
    fetchedAt: now,
  };
}

/** Set ONLY the cached local avatar path (null clears it). */
export function reduceSetAvatar(s: ProfileState, localPath: string | null): ProfileState {
  return s.avatarLocalPath === localPath ? s : { ...s, avatarLocalPath: localPath };
}

/**
 * Whether enough time has elapsed since the last fetch to refresh again. A
 * never-fetched profile (`fetchedAt === 0`) always refreshes. Otherwise we
 * throttle: refresh only once at least `PROFILE_REFRESH_MIN_INTERVAL_MS` has
 * elapsed since the last stamp. A just-fetched profile (`now === fetchedAt`) or
 * a backwards clock therefore does NOT trigger an immediate second refresh.
 *
 * EXCEPTION: a missing avatar (`avatarLocalPath == null`) always refreshes,
 * even when the identity itself is fresh. The identity fetch and the avatar
 * download are best-effort and independent — if the identity succeeds but the
 * avatar download fails (e.g. a hung/timed-out fetch), the freshly-stamped
 * `fetchedAt` would otherwise throttle every subsequent retry and the avatar
 * would never resolve. Retrying while the avatar cache is empty fixes that.
 */
export function shouldRefreshProfile(s: ProfileState, now: number): boolean {
  if (s.fetchedAt === 0) return true;
  if (s.avatarLocalPath == null) return true; // avatar not yet cached — keep retrying it
  return now - s.fetchedAt >= PROFILE_REFRESH_MIN_INTERVAL_MS;
}

const EMPTY: ProfileState = {
  id: null, username: null, displayName: null, email: null,
  avatarUrl: null, avatarLocalPath: null, fetchedAt: 0,
};

interface ProfileStore extends ProfileState {
  setIdentity: (id: Identity, now: number) => void;
  setAvatar: (localPath: string | null) => void;
}

export const useProfile = create<ProfileStore>((set) => ({
  ...EMPTY,
  setIdentity: (id, now) => set((s) => reduceSetIdentity(s, id, now)),
  setAvatar: (localPath) => set((s) => reduceSetAvatar(s, localPath)),
}));

/** Non-React snapshot for the refresh side-effect. */
export function profileSnapshot(): ProfileState {
  return useProfile.getState();
}

// Persist on every change (advisory; fire-and-forget).
useProfile.subscribe((s) => {
  const persisted: ProfileState = {
    id: s.id, username: s.username, displayName: s.displayName, email: s.email,
    avatarUrl: s.avatarUrl, avatarLocalPath: s.avatarLocalPath, fetchedAt: s.fetchedAt,
  };
  void AsyncStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(persisted));
});

// Hydrate from AsyncStorage on module init so the greeting renders instantly + offline.
void AsyncStorage.getItem(PROFILE_STORAGE_KEY).then((raw) => {
  if (raw === null) return;
  try {
    const parsed = JSON.parse(raw) as Partial<ProfileState>;
    useProfile.setState({ ...EMPTY, ...parsed });
  } catch {
    /* corrupted blob — keep defaults */
  }
});
