import React from 'react';
import { render, act, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { useNotificationTapHandler } from '@/push/useNotificationTapHandler';
import {
  __emitNotificationOpened,
  __resetFirebaseMessaging,
  __setInitialNotification,
} from '../../mocks/firebase-messaging';

let openURLSpy: jest.SpyInstance<Promise<boolean>, [string]>;

beforeEach(() => {
  __resetFirebaseMessaging();
  openURLSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
});

afterEach(() => {
  openURLSpy.mockRestore();
});

function Probe() {
  useNotificationTapHandler();
  return null;
}

describe('useNotificationTapHandler', () => {
  it('opens the deep link when onNotificationOpenedApp fires', async () => {
    await render(<Probe />);
    await act(async () => {
      __emitNotificationOpened({
        data: { deep_link: 'bookkeeprr://library/series/42' },
      });
    });
    expect(openURLSpy).toHaveBeenCalledWith('bookkeeprr://library/series/42');
  });

  it('ignores onNotificationOpenedApp payloads without a deep_link', async () => {
    await render(<Probe />);
    await act(async () => {
      __emitNotificationOpened({ data: { foo: 'bar' } });
    });
    expect(openURLSpy).not.toHaveBeenCalled();
  });

  it('opens the deep link from getInitialNotification on mount', async () => {
    __setInitialNotification({
      data: { deep_link: 'bookkeeprr://library/series/7' },
    });
    await render(<Probe />);
    // getInitialNotification is async, so its then() callback resolves two
    // microtask ticks after mount; flush both before asserting.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(openURLSpy).toHaveBeenCalledWith('bookkeeprr://library/series/7');
    });
  });

  it('does not open anything when getInitialNotification resolves to null', async () => {
    await render(<Probe />);
    // Wait a microtask so getInitialNotification's then() fires.
    await act(async () => {
      await Promise.resolve();
    });
    expect(openURLSpy).not.toHaveBeenCalled();
  });
});
