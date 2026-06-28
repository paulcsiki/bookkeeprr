import { create } from 'zustand';

interface OnboardingState {
  serverUrl: string;
  certFingerprint: string | null;
  setServerUrl: (url: string) => void;
  setCertFingerprint: (fp: string | null) => void;
  reset: () => void;
}

export const useOnboarding = create<OnboardingState>((set) => ({
  serverUrl: '',
  certFingerprint: null,
  setServerUrl: (serverUrl) => set({ serverUrl }),
  setCertFingerprint: (certFingerprint) => set({ certFingerprint }),
  reset: () => set({ serverUrl: '', certFingerprint: null }),
}));
