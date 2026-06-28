import { installFetchMock } from './e2e-fetch-mock';
import { pushEventBus } from '@/push/pushEventBus';
import { pushSettings } from '@/lib/pushSettings';

/**
 * Installs the in-app fetch mock when running under Maestro e2e flows.
 *
 * Maestro launches the app with env vars (`EXPO_PUBLIC_MOBILE_E2E*`) baked
 * into the bundle. The mock honors them (SSL_FAIL → reject handshake,
 * AUTH_MODE=oidc → return oidc-only modes, UPDATE_AVAILABLE → return higher
 * server version).
 *
 * MSW v2 isn't viable in RN because it pulls in browser globals
 * (MessageEvent, EventTarget, BroadcastChannel, …) that RN doesn't ship.
 * The Jest suite still uses MSW (Node provides those globals); fixtures
 * are shared.
 *
 * When `EXPO_PUBLIC_MOBILE_E2E_PUSH_FIRE=1` is baked into the bundle, also
 * schedule a recurring synthetic foreground push (first at +2s, then every
 * 3s) via `pushEventBus.emit(...)`, but ONLY if the user has previously
 * opted in to push (per `pushSettings`). `InAppBanner` subscribes to the
 * bus alongside `messaging().onMessage()`, so the banner renders without a
 * real FCM project. The deep link points at `library/series/1`, which the
 * navigator's linking config routes to the series overview screen.
 */
export async function bootstrapE2E(): Promise<void> {
  if (process.env.EXPO_PUBLIC_MOBILE_E2E !== '1') return;
  // Real-server runs (EXPO_PUBLIC_MOBILE_E2E_REAL_SERVER=1) drive a LIVE
  // bookkeeprr instance instead of the in-app fetch mock — so skip installing
  // the mock. The browser handoff is still bypassed via AUTOAUTH, which posts
  // a fixed exchange code to the server's env-gated bypass endpoint
  // (BOOKKEEPRR_E2E_LOGIN_BYPASS). Every other flow keeps the mock.
  if (process.env.EXPO_PUBLIC_MOBILE_E2E_REAL_SERVER !== '1') {
    installFetchMock();
  }
  if (process.env.EXPO_PUBLIC_MOBILE_E2E_PUSH_FIRE === '1') {
    // Fire 2s after launch — but ONLY if the user has previously opted in to
    // push (persisted via pushSettings). That keeps the banner from popping
    // over the onboarding flow during the first launch of
    // `permission-grant-and-register.yaml` (where the user opts in mid-flow),
    // and ensures it surfaces on the relaunch step of `foreground-banner.yaml`
    // and `deep-link-tap.yaml` (where the opt-in state survives in
    // AsyncStorage). The 60s banner auto-dismiss (see InAppBanner) gives
    // Maestro plenty of polling room.
    // Re-emit on a 3s interval (until the process exits). The 60s banner
    // auto-dismiss (see InAppBanner) means once one emit lands while
    // InAppBanner is mounted, the banner stays visible long enough for
    // Maestro's polling to find it. Each emit short-circuits if the user has
    // not opted in (avoiding banner-over-onboarding noise during the first
    // launchApp of `permission-grant-and-register.yaml`).
    const tick = (): void => {
      pushSettings
        .get()
        .then((s) => {
          if (!s.userOptedIn) return;
          pushEventBus.emit({
            title: 'Synthetic test push',
            body: 'e2e-payload-body',
            deepLink: 'bookkeeprr://library/series/1',
          });
        })
        .catch(() => undefined);
    };
    // First fire 2s after launch — late enough for InAppBanner to have mounted.
    // Re-fire every 3s thereafter so Maestro's polling assertions can land on
    // a visible banner even when the cold-start race delays InAppBanner's
    // subscription past the first tick. The banner's 60s e2e auto-dismiss
    // (see InAppBanner) keeps it on-screen long enough for the multi-step
    // foreground-banner / deep-link-tap flows.
    setTimeout(tick, 2000);
    setInterval(tick, 3000);
  }
}
