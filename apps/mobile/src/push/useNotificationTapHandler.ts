import { useEffect } from 'react';
import { Linking } from 'react-native';
import messaging from '@react-native-firebase/messaging';

// Wires the two notification-tap paths into Linking.openURL so the existing
// react-navigation linking config (defined in RootNavigator) can resolve the
// route:
//   * onNotificationOpenedApp — fires when the user taps a push while the app
//     is in the background (process still alive).
//   * getInitialNotification — checked once on mount to catch the case where
//     the user tapped a push that launched the app from a terminated state.
//
// The server-side payload contract is `data.deep_link: string` (a
// `bookkeeprr://...` URL). Both paths funnel through the same opener so
// adding new routes only requires extending RootNavigator's linking.config.
export function useNotificationTapHandler(): void {
  useEffect(() => {
    function openIfLink(link: unknown) {
      if (typeof link === 'string' && link.length > 0) {
        Linking.openURL(link).catch(() => undefined);
      }
    }

    const unsub = messaging().onNotificationOpenedApp((payload) => {
      openIfLink(payload?.data?.deep_link);
    });

    messaging()
      .getInitialNotification()
      .then((payload) => {
        const data = (payload as { data?: { deep_link?: unknown } } | null)?.data;
        openIfLink(data?.deep_link);
      })
      .catch(() => undefined);

    return () => {
      unsub();
    };
  }, []);
}
