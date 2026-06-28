import { Platform } from 'react-native';
import { http, HttpResponse } from 'msw';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PushService } from '@/push/PushService';
import { pushSettings } from '@/lib/pushSettings';
import { server } from '../../mocks/server';
import {
  __resetFirebaseMessaging,
  __setPermissionStatus,
  __setToken,
} from '../../mocks/firebase-messaging';

beforeEach(async () => {
  __resetFirebaseMessaging();
  await AsyncStorage.clear();
});

describe('PushService.enable', () => {
  it('requests permission, gets token, posts to server, persists state', async () => {
    const captured: { url: string; headers: Headers; body: unknown }[] = [];
    server.use(
      http.post('https://srv/api/mobile/push/register', async ({ request }) => {
        captured.push({
          url: request.url,
          headers: request.headers,
          body: await request.json(),
        });
        return HttpResponse.json(
          { id: 'srv-1', registered_at: '2026-05-26T00:00:00Z' },
          { status: 201 },
        );
      }),
    );

    const svc = new PushService({
      serverUrl: 'https://srv',
      accessToken: 'bearer-abc',
    });
    const result = await svc.enable();

    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.deviceId).toBe('srv-1');
    }
    expect(captured).toHaveLength(1);
    const first = captured[0]!;
    expect(first.url).toBe('https://srv/api/mobile/push/register');
    expect(first.headers.get('Authorization')).toBe('Bearer bearer-abc');
    expect(first.body).toEqual({
      device_token: 'mock-fcm-token',
      platform: Platform.OS,
    });
    expect(await pushSettings.get()).toEqual({
      userOptedIn: true,
      registeredToken: 'mock-fcm-token',
    });
  });

  it('returns permission_denied if user denies', async () => {
    let registerCalled = false;
    server.use(
      http.post('https://srv/api/mobile/push/register', () => {
        registerCalled = true;
        return HttpResponse.json({ id: 'x' }, { status: 201 });
      }),
    );
    __setPermissionStatus('DENIED');
    const svc = new PushService({ serverUrl: 'https://srv', accessToken: 'bearer-abc' });
    const result = await svc.enable();
    expect(result.kind).toBe('permission_denied');
    expect(registerCalled).toBe(false);
    expect(await pushSettings.get()).toEqual({ userOptedIn: false, registeredToken: null });
  });

  it('returns server_error on non-2xx', async () => {
    server.use(
      http.post(
        'https://srv/api/mobile/push/register',
        () => new HttpResponse(null, { status: 500 }),
      ),
    );
    const svc = new PushService({ serverUrl: 'https://srv', accessToken: 'bearer-abc' });
    const result = await svc.enable();
    expect(result.kind).toBe('server_error');
    if (result.kind === 'server_error') {
      expect(result.status).toBe(500);
    }
    expect(await pushSettings.get()).toEqual({ userOptedIn: false, registeredToken: null });
  });

  it('returns server_error when network rejects', async () => {
    server.use(http.post('https://srv/api/mobile/push/register', () => HttpResponse.error()));
    const svc = new PushService({ serverUrl: 'https://srv', accessToken: 'bearer-abc' });
    const result = await svc.enable();
    expect(result.kind).toBe('server_error');
    expect(await pushSettings.get()).toEqual({ userOptedIn: false, registeredToken: null });
  });

  it('uses the latest mocked token (not a cached value)', async () => {
    __setToken('rotated-token-zzz');
    let receivedBody: { device_token?: string } = {};
    server.use(
      http.post('https://srv/api/mobile/push/register', async ({ request }) => {
        receivedBody = (await request.json()) as { device_token?: string };
        return HttpResponse.json({ id: 'srv-2' }, { status: 201 });
      }),
    );
    const svc = new PushService({ serverUrl: 'https://srv', accessToken: 'bearer-abc' });
    const result = await svc.enable();
    expect(result.kind).toBe('ok');
    expect(receivedBody.device_token).toBe('rotated-token-zzz');
    expect((await pushSettings.get()).registeredToken).toBe('rotated-token-zzz');
  });
});

describe('PushService.enable e2eAutogrant short-circuit', () => {
  it('skips requestPermission AND getToken when e2eAutogrant=true', async () => {
    // Force-deny the OS permission and break `getToken` so any accidental call
    // would surface as permission_denied or token_error; the short-circuit must
    // bypass both entirely. In real e2e runs the stub `google-services.json`
    // makes the native `getToken()` throw a Firebase API-key error.
    __setPermissionStatus('DENIED');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const messaging = require('@react-native-firebase/messaging').default;
    messaging().getToken.mockRejectedValueOnce(new Error('Please set a valid API key'));
    let receivedBody: { device_token?: string } = {};
    server.use(
      http.post('https://srv/api/mobile/push/register', async ({ request }) => {
        receivedBody = (await request.json()) as { device_token?: string };
        return HttpResponse.json({ id: 'srv-autogrant' }, { status: 201 });
      }),
    );
    const svc = new PushService({
      serverUrl: 'https://srv',
      accessToken: 'bearer-abc',
      e2eAutogrant: true,
    });
    const result = await svc.enable();
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.deviceId).toBe('srv-autogrant');
    }
    expect(messaging().requestPermission).not.toHaveBeenCalled();
    expect(messaging().getToken).not.toHaveBeenCalled();
    expect(receivedBody.device_token).toBe('e2e-fcm-token');
    expect(await pushSettings.get()).toEqual({
      userOptedIn: true,
      registeredToken: 'e2e-fcm-token',
    });
  });
});

describe('PushService.disable', () => {
  it('clears opt-in state and deletes token', async () => {
    await pushSettings.setEnabled(true, 'mock-fcm-token');
    const svc = new PushService({ serverUrl: 'https://srv', accessToken: 'bearer-abc' });
    await svc.disable();
    expect(await pushSettings.get()).toEqual({ userOptedIn: false, registeredToken: null });
  });

  it('clears local state even when deleteToken throws', async () => {
    await pushSettings.setEnabled(true, 'mock-fcm-token');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const messaging = require('@react-native-firebase/messaging').default;
    messaging().deleteToken.mockRejectedValueOnce(new Error('boom'));
    const svc = new PushService({ serverUrl: 'https://srv', accessToken: 'bearer-abc' });
    await svc.disable();
    expect(await pushSettings.get()).toEqual({ userOptedIn: false, registeredToken: null });
  });
});

describe('PushService.refreshToken', () => {
  it('re-registers with the current token when previously opted-in', async () => {
    await pushSettings.setEnabled(true, 'old-token');
    __setToken('new-token');
    server.use(
      http.post('https://srv/api/mobile/push/register', () =>
        HttpResponse.json({ id: 'srv-3' }, { status: 201 }),
      ),
    );
    const svc = new PushService({ serverUrl: 'https://srv', accessToken: 'bearer-abc' });
    const result = await svc.refreshToken();
    expect(result.kind).toBe('ok');
    expect((await pushSettings.get()).registeredToken).toBe('new-token');
  });

  it('is a no-op when user has not opted in', async () => {
    let called = false;
    server.use(
      http.post('https://srv/api/mobile/push/register', () => {
        called = true;
        return HttpResponse.json({ id: 'x' }, { status: 201 });
      }),
    );
    const svc = new PushService({ serverUrl: 'https://srv', accessToken: 'bearer-abc' });
    const result = await svc.refreshToken();
    expect(result.kind).toBe('not_enabled');
    expect(called).toBe(false);
  });
});
