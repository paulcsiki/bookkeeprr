import { render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { Avatar } from '@/components/Avatar';

// The blob-util mock sets DocumentDir to '/mock/Documents' (see tests/mocks/blob-util.ts).

it('renders initials as the fallback', async () => {
  const { getByText } = await render(
    <ThemeProvider>
      <Avatar email="maya@example.com" name="Maya Chen" />
    </ThemeProvider>,
  );
  expect(getByText('MC')).toBeTruthy();
});

it('builds the correct Gravatar src from email', async () => {
  const { getByTestId } = await render(
    <ThemeProvider>
      <Avatar email="MAYA@EXAMPLE.COM " name="Maya Chen" size={40} testID="av" />
    </ThemeProvider>,
  );
  const av = getByTestId('avatar-image');
  // Real md5('maya@example.com') — confirmed by Task 6 web review:
  // 7f042523605eb9acbaa4df4ae2d4f20b
  expect(JSON.stringify(av.props)).toContain('7f042523605eb9acbaa4df4ae2d4f20b');
});

it('prefers the locally-cached image over Gravatar (offline-safe) — absolute path under current DocumentDir', async () => {
  const { getByTestId } = await render(
    <ThemeProvider>
      {/* Absolute path that matches the current mock DocumentDir — resolveOffline passes it through as-is. */}
      <Avatar email="maya@example.com" name="Maya Chen" avatarLocalPath="/mock/Documents/profile/avatar" />
    </ThemeProvider>,
  );
  const av = getByTestId('avatar-image');
  expect(JSON.stringify(av.props)).toContain('file:///mock/Documents/profile/avatar');
  expect(JSON.stringify(av.props)).not.toContain('gravatar.com');
});

it('resolves a relative avatarLocalPath to the current DocumentDir (UUID-rotation fix)', async () => {
  const { getByTestId } = await render(
    <ThemeProvider>
      {/* Relative path as stored by the new refreshProfile fix */}
      <Avatar email="maya@example.com" name="Maya Chen" avatarLocalPath="profile/avatar" />
    </ThemeProvider>,
  );
  const av = getByTestId('avatar-image');
  // resolveOffline('profile/avatar') → '/mock/Documents/profile/avatar'
  expect(JSON.stringify(av.props)).toContain('file:///mock/Documents/profile/avatar');
  expect(JSON.stringify(av.props)).not.toContain('gravatar.com');
});

it('re-bases a stale absolute path from an old container UUID to the current DocumentDir (lossless profile/ migration)', async () => {
  const { getByTestId } = await render(
    <ThemeProvider>
      {/* Old-UUID absolute path with a /profile/ segment — toRelative recognises
          'profile/' as a stable app-relative root and keeps everything from there
          onward. resolveOffline then prepends the current DocumentDir. The result
          is the correct live path, NOT a truncated basename. */}
      <Avatar
        email="maya@example.com"
        name="Maya Chen"
        avatarLocalPath="/var/mobile/Containers/Data/OLD-UUID-1234/Documents/profile/avatar"
      />
    </ThemeProvider>,
  );
  const av = getByTestId('avatar-image');
  // toRelative('/…/OLD-UUID-1234/Documents/profile/avatar') → 'profile/avatar'
  // resolveOffline('profile/avatar') → '/mock/Documents/profile/avatar'
  expect(JSON.stringify(av.props)).toContain('file:///mock/Documents/profile/avatar');
  expect(JSON.stringify(av.props)).not.toContain('OLD-UUID-1234');
  expect(JSON.stringify(av.props)).not.toContain('gravatar.com');
});
