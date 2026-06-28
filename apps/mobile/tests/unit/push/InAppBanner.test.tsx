import React from 'react';
import { render, act } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { InAppBanner } from '@/push/InAppBanner';
import { pushEventBus } from '@/push/pushEventBus';
import { __emitForegroundMessage, __resetFirebaseMessaging } from '../../mocks/firebase-messaging';

beforeEach(() => {
  __resetFirebaseMessaging();
});

describe('InAppBanner', () => {
  it('shows banner when foreground rn-firebase message arrives', async () => {
    const { findByTestId, getByText } = await render(
      <ThemeProvider>
        <InAppBanner />
      </ThemeProvider>,
    );
    await act(async () => {
      __emitForegroundMessage({
        notification: { title: 'New issue', body: 'Onepunch Man #210 added' },
        data: { deep_link: 'bookkeeprr://library/series/42' },
      });
    });
    await findByTestId('in-app-banner');
    expect(getByText('New issue')).toBeTruthy();
    expect(getByText('Onepunch Man #210 added')).toBeTruthy();
  });

  it('shows banner when pushEventBus emits a synthetic message', async () => {
    const { findByTestId, getByText } = await render(
      <ThemeProvider>
        <InAppBanner />
      </ThemeProvider>,
    );
    await act(async () => {
      pushEventBus.emit({
        title: 'Synthetic test push',
        body: 'e2e-payload-body',
        deepLink: 'bookkeeprr://library/series/1',
      });
    });
    await findByTestId('in-app-banner');
    expect(getByText('Synthetic test push')).toBeTruthy();
    expect(getByText('e2e-payload-body')).toBeTruthy();
  });

  it('auto-dismisses after 5 seconds', async () => {
    jest.useFakeTimers();
    try {
      const { queryByTestId } = await render(
        <ThemeProvider>
          <InAppBanner />
        </ThemeProvider>,
      );
      await act(async () => {
        __emitForegroundMessage({
          notification: { title: 'X', body: 'Y' },
        });
      });
      expect(queryByTestId('in-app-banner')).toBeTruthy();
      await act(async () => {
        jest.advanceTimersByTime(5500);
      });
      expect(queryByTestId('in-app-banner')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('ignores messages with no title and no body', async () => {
    const { queryByTestId } = await render(
      <ThemeProvider>
        <InAppBanner />
      </ThemeProvider>,
    );
    act(() => {
      __emitForegroundMessage({ data: { foo: 'bar' } });
    });
    expect(queryByTestId('in-app-banner')).toBeNull();
  });
});
