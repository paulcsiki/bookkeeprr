import type { ReactNode } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import FastImage from 'react-native-fast-image';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { useTokens } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/typography';
import { useAuth } from '@/auth/AuthContext';

type Size = 'sm' | 'md' | 'lg';

interface Props {
  uri?: string | null;
  hue?: number;
  title?: string;
  size?: Size;
  ratio?: number;
  flush?: boolean; // drop the border + rounding (full-bleed hero use)
  children?: ReactNode;
}

// Series cover. When a real cover URL is present it fills the tile; otherwise a
// hue-driven gradient backdrop shows with the title overlaid (display font),
// mirroring the design's empty-cover treatment. Covers are intentionally dark
// in every theme, so the gradient uses literal hsl values rather than tokens.
export function Cover({
  uri,
  hue = 263,
  title,
  size = 'md',
  ratio = 2 / 3,
  flush = false,
  children,
}: Props) {
  const t = useTokens();
  const { state } = useAuth();
  const token = state.status === 'authenticated' ? state.creds.token : '';
  // Strip a trailing slash so `uri.startsWith(serverUrl)` matches the resolved
  // proxy URI (resolveAssetUri builds it from the slash-stripped origin).
  const serverUrl =
    state.status === 'authenticated' ? state.creds.serverUrl.replace(/\/$/, '') : '';
  const radius = flush ? 0 : size === 'sm' ? 4 : 8;
  return (
    <View
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: ratio,
        borderRadius: radius,
        overflow: 'hidden',
        borderWidth: flush ? 0 : 1,
        borderColor: t.border,
        justifyContent: 'flex-end',
      }}
    >
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <LinearGradient id="coverbg" x1="0" y1="0" x2="0.34" y2="1">
            <Stop offset="0" stopColor={`hsl(${hue} 35% 22%)`} />
            <Stop offset="0.6" stopColor={`hsl(${hue} 30% 12%)`} />
            <Stop offset="1" stopColor={t.coverBase} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#coverbg)" />
      </Svg>

      {title && size !== 'sm' && !uri ? (
        <Text
          numberOfLines={3}
          style={{
            margin: size === 'lg' ? 16 : 9,
            fontFamily: fonts.display.semibold,
            fontSize: size === 'lg' ? 22 : 12,
            letterSpacing: -0.3,
            lineHeight: size === 'lg' ? 25 : 14,
            color: t.coverTitle,
            textShadowColor: t.coverTitleShadow,
            textShadowOffset: { width: 0, height: 1 },
            textShadowRadius: 4,
          }}
        >
          {title}
        </Text>
      ) : null}

      {uri ? (
        <FastImage
          source={{
            uri,
            ...(token && serverUrl && uri.startsWith(serverUrl)
              ? { headers: { Authorization: `Bearer ${token}` } }
              : {}),
          }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      {children}
    </View>
  );
}
