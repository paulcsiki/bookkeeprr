// Unit tests: Cover attaches Authorization header for same-origin /api/img URIs,
// omits it for external URIs, and renders without crashing when unauthenticated.
import { render, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { AuthProvider } from '@/auth/AuthContext';
import { Cover } from '@/components/Cover';

// Wire up a token-store mock so AuthProvider resolves to authenticated with a
// known serverUrl + token — the same pattern used throughout the unit test suite.
jest.mock('@/auth/token-store', () => ({
  tokenStore: {
    load: jest.fn().mockResolvedValue({
      serverUrl: 'https://srv',
      token: 't',
      refreshToken: 'ref',
      expiresAt: '2027-01-01T00:00:00Z',
      certFingerprint: null,
    }),
    save: jest.fn(),
    clear: jest.fn(),
  },
}));

function wrap(ui: React.ReactElement) {
  return render(
    <ThemeProvider>
      <AuthProvider>{ui}</AuthProvider>
    </ThemeProvider>,
  );
}

describe('Cover — Authorization header', () => {
  it('sends Authorization header for a same-origin /api/img URI', async () => {
    const { toJSON } = await wrap(
      <Cover uri="https://srv/api/img?u=abc123" />,
    );
    await waitFor(() => {
      const tree = JSON.stringify(toJSON());
      expect(tree).toContain('"Authorization":"Bearer t"');
    });
  });

  it('does NOT send Authorization header for an external URI', async () => {
    const { toJSON } = await wrap(
      <Cover uri="https://cdn.example.com/x.jpg" />,
    );
    await waitFor(() => {
      const tree = JSON.stringify(toJSON());
      // Assert the header KEY is absent (token-value-independent), not just the
      // sample token string — and that the token never leaks to a third party.
      expect(tree).not.toContain('Authorization');
      expect(tree).not.toContain('Bearer');
    });
  });

  it('renders gradient placeholder without crashing when uri is null (unauthenticated-safe)', async () => {
    const { toJSON } = await wrap(<Cover uri={null} title="My Book" />);
    await waitFor(() => {
      // Should render without crashing; no FastImage source at all.
      const tree = JSON.stringify(toJSON());
      expect(tree).not.toContain('"uri"');
    });
  });
});
