import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Naming from '@/screens/settings/Naming';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { AuthProvider } from '@/auth/AuthContext';
import { server } from '../../mocks/server';
import { http, HttpResponse } from 'msw';

jest.mock('@/auth/token-store', () => ({
  tokenStore: {
    load: jest.fn().mockResolvedValue({
      serverUrl: 'https://srv',
      token: 't',
      refreshToken: 'r',
      expiresAt: '2999-01-01T00:00:00Z',
      certFingerprint: null,
    }),
    save: jest.fn(),
    clear: jest.fn(),
  },
}));

const adminMe = () =>
  http.get('https://srv/api/mobile/me', () =>
    HttpResponse.json({ id: 1, username: 'admin', email: null, displayName: null, role: 'admin' }),
  );

const MANGA_TEMPLATES = {
  series_folder: '{series_title}',
  volume: '{series_title} - v{volume:00} [{group}].{ext}',
  chapter: '{series_title} - c{chapter:000} [{group}].{ext}',
  batch: '{series_title} - c{chapter_range} [{group}].{ext}',
  volume_subfolder: '',
};

const COMIC_TEMPLATES = {
  series_folder: '{publisher}/{series_title} ({series_year})',
  volume: '{series_title} v{volume:00} [{group}].{ext}',
  chapter: '{series_title} #{chapter:000} [{group}].{ext}',
  batch: '{series_title} #{chapter_range} [{group}].{ext}',
  volume_subfolder: '',
};

// GET that serves per-contentType templates from the query string.
const namingGet = () =>
  http.get('https://srv/api/settings/naming', ({ request }) => {
    const ct = new URL(request.url).searchParams.get('contentType') ?? 'manga';
    const templates = ct === 'comic' ? COMIC_TEMPLATES : MANGA_TEMPLATES;
    return HttpResponse.json({ contentType: ct, templates });
  });

function renderScreen() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={qc}>
          <Naming />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
}

it('renders a manga volume preview containing the fixture series and volume', async () => {
  server.use(adminMe(), namingGet());

  await act(async () => {
    renderScreen();
  });

  await waitFor(() => expect(screen.getByTestId('screen-naming')).toBeTruthy());
  await waitFor(() => expect(screen.getByTestId('naming-input-volume')).toBeTruthy());

  // Seeded from the GET.
  expect(screen.getByTestId('naming-input-volume').props.value).toBe(
    '{series_title} - v{volume:00} [{group}].{ext}',
  );

  const preview = screen.getByTestId('naming-preview-volume');
  expect(preview).toHaveTextContent(/Chainsaw Man/);
  expect(preview).toHaveTextContent(/v14/);
});

it('shows the validation error and blocks save when a template is invalid', async () => {
  let patched = false;
  server.use(
    adminMe(),
    namingGet(),
    http.put('https://srv/api/settings/naming', () => {
      patched = true;
      return HttpResponse.json({ ok: true });
    }),
  );

  await act(async () => {
    renderScreen();
  });

  await waitFor(() => expect(screen.getByTestId('naming-input-volume')).toBeTruthy());

  // `{chapter}` is not allowed in a volume template — the engine flags it.
  await act(async () => {
    fireEvent.changeText(screen.getByTestId('naming-input-volume'), '{series_title} c{chapter}');
  });

  await waitFor(() =>
    expect(screen.getByTestId('naming-preview-volume')).toHaveTextContent(/not allowed in volume/),
  );

  await act(async () => {
    fireEvent.press(screen.getByTestId('naming-save'));
  });

  // A short settle window; the PUT must never fire while invalid.
  await act(async () => {
    await Promise.resolve();
  });
  expect(patched).toBe(false);
});

it('loads comic templates when switching content type', async () => {
  server.use(adminMe(), namingGet());

  await act(async () => {
    renderScreen();
  });

  await waitFor(() => expect(screen.getByTestId('naming-input-series_folder')).toBeTruthy());
  expect(screen.getByTestId('naming-input-series_folder').props.value).toBe('{series_title}');

  await act(async () => {
    fireEvent.press(screen.getByTestId('naming-ct-comic'));
  });

  await waitFor(() =>
    expect(screen.getByTestId('naming-input-series_folder').props.value).toBe(
      '{publisher}/{series_title} ({series_year})',
    ),
  );
});

it('PUTs { templates } to ?contentType=manga on save', async () => {
  let putUrl: string | null = null;
  let putBody: Record<string, unknown> | null = null;
  server.use(
    adminMe(),
    namingGet(),
    http.put('https://srv/api/settings/naming', async ({ request }) => {
      putUrl = request.url;
      putBody = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ ok: true });
    }),
  );

  await act(async () => {
    renderScreen();
  });

  await waitFor(() => expect(screen.getByTestId('naming-input-series_folder')).toBeTruthy());

  // Make an edit so the form is dirty and Save is enabled.
  await act(async () => {
    fireEvent.changeText(screen.getByTestId('naming-input-series_folder'), '{series_title}!');
  });

  await act(async () => {
    fireEvent.press(screen.getByTestId('naming-save'));
  });

  await waitFor(() => expect(putBody).not.toBeNull());
  expect(putUrl).toContain('contentType=manga');
  expect(putBody).toEqual({
    templates: {
      series_folder: '{series_title}!',
      volume: MANGA_TEMPLATES.volume,
      chapter: MANGA_TEMPLATES.chapter,
      batch: MANGA_TEMPLATES.batch,
      volume_subfolder: '',
    },
  });
});
