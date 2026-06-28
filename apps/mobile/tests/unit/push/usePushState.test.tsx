import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePushState } from '@/push/usePushState';
import { pushSettings } from '@/lib/pushSettings';

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('usePushState', () => {
  it('returns userOptedIn=false initially', async () => {
    const { result } = await renderHook(() => usePushState(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual({ userOptedIn: false, registeredToken: null });
  });

  it('reflects pushSettings after setEnabled', async () => {
    await pushSettings.setEnabled(true, 'tok');
    const { result } = await renderHook(() => usePushState(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual({ userOptedIn: true, registeredToken: 'tok' });
  });
});
