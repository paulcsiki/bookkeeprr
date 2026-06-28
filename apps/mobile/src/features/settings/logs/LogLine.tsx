import { View, Text } from 'react-native';
import { useTokens } from '@/theme/ThemeProvider';
import type { Tokens } from '@/theme/tokens';
import { text, fonts } from '@/theme/typography';

/** Canonical level labels, in descending severity. */
export const LOG_LEVELS = ['FATL', 'ERR', 'WARN', 'INFO', 'DBG', 'TRCE'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/** Map a pino numeric level to its short badge label. */
function levelLabel(level: number): LogLevel {
  if (level >= 60) return 'FATL';
  if (level >= 50) return 'ERR';
  if (level >= 40) return 'WARN';
  if (level >= 30) return 'INFO';
  if (level >= 20) return 'DBG';
  return 'TRCE';
}

/**
 * Parse a raw pino JSON line and return its level label, or null if the line
 * isn't parseable / carries no numeric level. Used for client-side filtering.
 */
export function levelOf(line: string): LogLevel | null {
  try {
    const parsed: unknown = JSON.parse(line);
    if (parsed && typeof parsed === 'object' && typeof (parsed as { level?: unknown }).level === 'number') {
      return levelLabel((parsed as { level: number }).level);
    }
  } catch {
    /* not JSON — no level */
  }
  return null;
}

/** SOLID background + on-color foreground for each level badge (never translucent). */
function badgeColors(t: Tokens, level: LogLevel): { bg: string; fg: string } {
  switch (level) {
    case 'FATL':
    case 'ERR':
      return { bg: t.err, fg: t.primaryFg };
    case 'WARN':
      return { bg: t.warn, fg: t.primaryFg };
    case 'INFO':
      return { bg: t.info, fg: t.primaryFg };
    case 'DBG':
    case 'TRCE':
      return { bg: t.surfaceMuted, fg: t.textMuted };
  }
}

interface ParsedLine {
  time?: number;
  level?: number;
  component?: string;
  msg?: string;
}

interface Props {
  line: string;
}

export function LogLine({ line }: Props) {
  const t = useTokens();

  let parsed: ParsedLine | null = null;
  try {
    const raw: unknown = JSON.parse(line);
    if (raw && typeof raw === 'object') {
      const o = raw as Record<string, unknown>;
      parsed = {
        ...(typeof o.time === 'number' ? { time: o.time } : {}),
        ...(typeof o.level === 'number' ? { level: o.level } : {}),
        ...(typeof o.component === 'string' ? { component: o.component } : {}),
        ...(typeof o.msg === 'string' ? { msg: o.msg } : {}),
      };
    }
  } catch {
    parsed = null;
  }

  // Unparseable → raw text in mono.
  if (parsed === null || parsed.level === undefined) {
    return (
      <View testID="log-line" style={{ paddingVertical: 6, paddingHorizontal: 4 }}>
        <Text style={[text.monoSm, { color: t.textMuted }]}>{line}</Text>
      </View>
    );
  }

  const label = levelLabel(parsed.level);
  const colors = badgeColors(t, label);
  const timeStr = parsed.time !== undefined ? new Date(parsed.time).toISOString() : null;

  return (
    <View
      testID="log-line"
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
        paddingVertical: 6,
        paddingHorizontal: 4,
      }}
    >
      <View
        style={{
          backgroundColor: colors.bg,
          borderRadius: 5,
          paddingHorizontal: 6,
          paddingVertical: 2,
          minWidth: 42,
          alignItems: 'center',
        }}
      >
        <Text style={[text.monoSm, { color: colors.fg, fontFamily: fonts.mono.medium, letterSpacing: 0.5 }]}>
          {label}
        </Text>
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {timeStr ? <Text style={[text.monoSm, { color: t.textMuted }]}>{timeStr}</Text> : null}
          {parsed.component ? (
            <Text style={[text.monoSm, { color: t.textMuted }]}>{parsed.component}</Text>
          ) : null}
        </View>
        {parsed.msg ? <Text style={[text.mono, { color: t.text }]}>{parsed.msg}</Text> : null}
      </View>
    </View>
  );
}
