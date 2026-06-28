import { create } from 'zustand';
import * as SecureStore from '@/lib/secure-storage';

const KEY = 'bookkeeprr.changelog.lastSeen.v1';

interface ChangelogState {
  lastSeen: string | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setLastSeen: (version: string) => Promise<void>;
}

export const useChangelogStore = create<ChangelogState>((set) => ({
  lastSeen: null,
  hydrated: false,
  hydrate: async () => {
    const raw = await SecureStore.getItemAsync(KEY);
    set({ lastSeen: raw, hydrated: true });
  },
  setLastSeen: async (version) => {
    await SecureStore.setItemAsync(KEY, version);
    set({ lastSeen: version });
  },
}));
