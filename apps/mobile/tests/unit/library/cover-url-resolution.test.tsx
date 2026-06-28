// Unit tests: GridCard + ListRow resolve root-relative coverUrls against the
// server origin so <Cover> receives a loadable absolute URL.
import { render, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { AuthProvider } from '@/auth/AuthContext';
import { GridCard } from '@/features/library/GridCard';
import { ListRow } from '@/features/library/ListRow';
import type { SeriesSummary } from '@/api/schemas';

// Wire up a token-store mock so AuthProvider resolves to authenticated with a
// known serverUrl — the same pattern used throughout the unit test suite.
jest.mock('@/auth/token-store', () => ({
  tokenStore: {
    load: jest.fn().mockResolvedValue({
      serverUrl: 'https://srv.example.com',
      token: 'tok',
      refreshToken: 'ref',
      expiresAt: '2027-01-01T00:00:00Z',
      certFingerprint: null,
    }),
    save: jest.fn(),
    clear: jest.fn(),
  },
}));

function makeSeries(overrides: Partial<SeriesSummary> = {}): SeriesSummary {
  return {
    id: 1,
    title: 'Vinland Saga',
    contentType: 'manga',
    coverUrl: '/api/img/abc123.webp',
    monitored: true,
    volumes: 10,
    downloaded: 0,
    groupId: null,
    groupPath: '',
    ...overrides,
  };
}

function wrap(ui: React.ReactElement) {
  return render(
    <ThemeProvider>
      <AuthProvider>{ui}</AuthProvider>
    </ThemeProvider>,
  );
}

describe('GridCard — cover URL resolution', () => {
  it('passes an absolute URL to Cover when coverUrl is root-relative', async () => {
    const { toJSON } = await wrap(
      <GridCard series={makeSeries({ coverUrl: '/api/img/abc123.webp' })} onPress={() => {}} />,
    );
    // Wait for AuthProvider to finish loading the token store and re-render.
    await waitFor(() => {
      const tree = JSON.stringify(toJSON());
      expect(tree).toContain('https://srv.example.com/api/img/abc123.webp');
    });
  });

  it('passes an absolute external URL through unchanged', async () => {
    const { toJSON } = await wrap(
      <GridCard
        series={makeSeries({ coverUrl: 'https://cdn.example.com/cover.jpg' })}
        onPress={() => {}}
      />,
    );
    await waitFor(() => {
      expect(JSON.stringify(toJSON())).toContain('https://cdn.example.com/cover.jpg');
    });
  });

  it('passes null to Cover when coverUrl is null (renders gradient placeholder)', async () => {
    // resolveAssetUri returns null for empty input → Cover renders gradient placeholder.
    const { toJSON } = await wrap(
      <GridCard series={makeSeries({ coverUrl: null })} onPress={() => {}} />,
    );
    await waitFor(() => {
      expect(JSON.stringify(toJSON())).not.toContain('srv.example.com');
    });
  });
});

describe('ListRow — cover URL resolution', () => {
  it('passes an absolute URL to Cover when coverUrl is root-relative', async () => {
    const { toJSON } = await wrap(
      <ListRow series={makeSeries({ coverUrl: '/api/img/abc123.webp' })} onPress={() => {}} />,
    );
    await waitFor(() => {
      expect(JSON.stringify(toJSON())).toContain('https://srv.example.com/api/img/abc123.webp');
    });
  });

  it('passes an absolute external URL through unchanged', async () => {
    const { toJSON } = await wrap(
      <ListRow
        series={makeSeries({ coverUrl: 'https://cdn.example.com/cover.jpg' })}
        onPress={() => {}}
      />,
    );
    await waitFor(() => {
      expect(JSON.stringify(toJSON())).toContain('https://cdn.example.com/cover.jpg');
    });
  });
});
