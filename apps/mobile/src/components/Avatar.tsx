import { useState } from 'react';
import { View, Text, Image } from 'react-native';
import { md5 } from 'js-md5';
import { useTokens } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/typography';
import { withAlpha } from '@/theme/color';
import { resolveOffline } from '@/features/reader/lib/offline-download';

type Props = {
  email: string;
  name: string;
  size?: number;
  testID?: string;
  /** Prefer this URL over Gravatar when set. Must be an absolute URL or relative path. */
  avatarUrl?: string | null;
  /**
   * On-device path of a cached avatar image (from `profileStore`). Takes
   * precedence over `avatarUrl`/Gravatar so the avatar renders OFFLINE with no
   * network at paint time. A bare filesystem path is rewritten to a `file://`
   * URI; an already-`file://`/`content://` value is used as-is.
   */
  avatarLocalPath?: string | null;
};

function initials(name: string): string {
  const parts = name.trim().split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

/** Normalize an on-disk path to a URI RN's <Image> can load. */
function toFileUri(path: string): string {
  return /^(file|content|asset):\/\//.test(path) ? path : `file://${path}`;
}

export function Avatar({ email, name, size = 36, testID, avatarUrl, avatarLocalPath }: Props) {
  const t = useTokens();
  const [failed, setFailed] = useState(false);
  const hash = md5(email.trim().toLowerCase());
  const gravatarSrc = `https://www.gravatar.com/avatar/${hash}?s=${size * 2}&d=404`;
  // Source precedence: locally-cached image (offline-safe) → custom avatar URL →
  // Gravatar. The local path is the only source that renders with no network.
  // resolveOffline() turns a stored relative path (e.g. "profile/avatar") into
  // the current absolute DocumentDir path, and also re-bases a stale absolute
  // path (from an old iOS container UUID) to the current container — so the
  // avatar survives app updates regardless of whether the stored value was
  // written before or after the relative-path fix shipped.
  const src =
    avatarLocalPath != null && avatarLocalPath.length > 0
      ? toFileUri(resolveOffline(avatarLocalPath))
      : avatarUrl != null && avatarUrl.length > 0
        ? avatarUrl
        : gravatarSrc;

  return (
    <View
      testID={testID}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: withAlpha(t.manga, 0.4),
        borderWidth: 1,
        borderColor: t.border,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <Text
        testID="avatar-initials"
        style={{
          fontFamily: fonts.display.semibold,
          fontSize: Math.max(10, Math.round(size * 0.32)),
          color: withAlpha(t.manga, 0.9),
        }}
      >
        {initials(name)}
      </Text>
      {!failed && (
        <Image
          testID="avatar-image"
          source={{ uri: src }}
          onError={() => setFailed(true)}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: size, height: size }}
        />
      )}
    </View>
  );
}
