import { useRef, useState } from 'react';
import { View, Text, Pressable, PanResponder, type LayoutChangeEvent } from 'react-native';
import { BottomSheet } from '@/components/BottomSheet';
import { text } from '@/theme/typography';
import { useTokens } from '@/theme/ThemeProvider';
import { READER_THEME_KEYS, readerPalette, type ReaderThemeKey } from '@/theme/reader-themes';
import { useReaderTheme } from './ReaderThemeContext';
import { posFromGesture } from './ProgressRail';

/** Not a color literal (no hex/hsl/rgb); used for the unselected choice fill. */
const TRANSPARENT = 'transparent';

const THEME_LABELS: Record<ReaderThemeKey, string> = {
  paper: 'Paper',
  sepia: 'Sepia',
  dark: 'Dark',
  oled: 'OLED',
};

/** A minimal themed slider (0..1) — PanResponder over a measured track. */
function Slider({
  value,
  onChange,
  testID,
}: {
  value: number;
  onChange: (v: number) => void;
  testID?: string;
}) {
  const { palette } = useReaderTheme();
  const widthRef = useRef(0);
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => {
    widthRef.current = e.nativeEvent.layout.width;
    setWidth(e.nativeEvent.layout.width);
  };
  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) =>
        onChange(posFromGesture(e.nativeEvent.locationX, widthRef.current)),
      onPanResponderMove: (e) =>
        onChange(posFromGesture(e.nativeEvent.locationX, widthRef.current)),
    }),
  ).current;
  const pct = Math.max(0, Math.min(1, value));
  return (
    <View
      testID={testID}
      onLayout={onLayout}
      {...responder.panHandlers}
      style={{ height: 22, justifyContent: 'center' }}
    >
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          height: 4,
          borderRadius: 99,
          backgroundColor: palette.line2,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 0,
          width: `${pct * 100}%`,
          height: 4,
          borderRadius: 99,
          backgroundColor: palette.accent,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: width * pct - 8,
          width: 16,
          height: 16,
          borderRadius: 99,
          backgroundColor: palette.accent,
        }}
      />
    </View>
  );
}

function SectionLabel({ children }: { children: string }) {
  const { palette } = useReaderTheme();
  return (
    <Text style={[text.monoSm, { color: palette.inkSoft, marginBottom: 8, letterSpacing: 1 }]}>
      {children}
    </Text>
  );
}

/** A pill-style choice toggle, used for per-kind options. */
function Choice<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const { palette } = useReaderTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {options.map((o) => {
        const active = o.value === value;
        const bg = active ? palette.accent : TRANSPARENT;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            onPress={() => onChange(o.value)}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: active ? palette.accent : palette.line2,
              backgroundColor: bg,
            }}
          >
            <Text style={[text.label, { color: active ? palette.page : palette.ink }]}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export interface TextOptions {
  /** Font scale, 0.8..1.6. */
  fontScale: number;
  setFontScale: (v: number) => void;
}

/** The paged-vs-scroll fallback toggle for the text reader. */
export interface ScrollModeOption {
  value: boolean;
  set: (v: boolean) => void;
}

/** Audio-reader options: playback rate cycle + a sleep-timer picker. */
export interface AudioOptions {
  /** The current playback rate (e.g. 1, 1.25). */
  rate: number;
  /** Cycle to the next rate. */
  cycleRate: () => void;
  /** Active sleep-timer minutes (null = off). */
  sleepMinutes: number | null;
  /** Arm/disarm the sleep timer (null = off). */
  setSleepMinutes: (m: number | null) => void;
}

export interface ComicsOptions {
  spread: 'single' | 'spread' | 'webtoon';
  setSpread: (v: 'single' | 'spread' | 'webtoon') => void;
  direction: 'ltr' | 'rtl';
  setDirection: (v: 'ltr' | 'rtl') => void;
}

export interface SettingsSheetProps {
  onDismiss: () => void;
  /** Text-reader options (omit for non-text kinds). */
  textOptions?: TextOptions;
  /** Paged-vs-scroll fallback toggle (text reader only). */
  scrollMode?: ScrollModeOption;
  /** Comics-reader options (omit for non-comics kinds). */
  comicsOptions?: ComicsOptions;
  /** Audio-reader options (omit for non-audio kinds). */
  audioOptions?: AudioOptions;
}

/**
 * The reader display sheet: theme swatches, a brightness slider, and per-kind
 * options. The host `BottomSheet` is themed by the app tokens (it floats above
 * the reader surface); the reader-specific controls use the reader palette.
 * Driven entirely by props + the reader-theme context.
 */
const SLEEP_CHOICES: { value: string; label: string; minutes: number | null }[] = [
  { value: 'off', label: 'Off', minutes: null },
  { value: '15', label: '15m', minutes: 15 },
  { value: '30', label: '30m', minutes: 30 },
  { value: '60', label: '60m', minutes: 60 },
];

export function SettingsSheet({
  onDismiss,
  textOptions,
  scrollMode,
  comicsOptions,
  audioOptions,
}: SettingsSheetProps) {
  const t = useTokens();
  const { themeKey, palette, brightness, setThemeKey, setBrightness } = useReaderTheme();

  return (
    <BottomSheet testID="reader-settings-sheet" onDismiss={onDismiss}>
      <View style={{ paddingHorizontal: 20, gap: 18 }}>
        <View>
          <SectionLabel>THEME</SectionLabel>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {READER_THEME_KEYS.map((key) => {
              const p = readerPalette(key, t.primary);
              const active = key === themeKey;
              return (
                <Pressable
                  key={key}
                  testID={`reader-theme-${key}`}
                  accessibilityRole="button"
                  accessibilityLabel={THEME_LABELS[key]}
                  onPress={() => setThemeKey(key)}
                  style={{ alignItems: 'center', gap: 6 }}
                >
                  <View
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 12,
                      backgroundColor: p.page,
                      borderWidth: active ? 2 : 1,
                      borderColor: active ? p.accent : p.line2,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={[text.displaySm, { color: p.ink }]}>Aa</Text>
                  </View>
                  <Text style={[text.monoSm, { color: palette.inkSoft }]}>{THEME_LABELS[key]}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View>
          <SectionLabel>BRIGHTNESS</SectionLabel>
          <Slider testID="reader-brightness" value={brightness} onChange={setBrightness} />
        </View>

        {textOptions ? (
          <View>
            <SectionLabel>FONT SIZE</SectionLabel>
            <Slider
              testID="reader-font-size"
              value={(textOptions.fontScale - 0.8) / 0.8}
              onChange={(v) => textOptions.setFontScale(0.8 + v * 0.8)}
            />
          </View>
        ) : null}

        {scrollMode ? (
          <View>
            <SectionLabel>FLOW</SectionLabel>
            <Choice
              value={scrollMode.value ? 'scroll' : 'paged'}
              onChange={(v) => scrollMode.set(v === 'scroll')}
              options={[
                { value: 'paged', label: 'Paged' },
                { value: 'scroll', label: 'Scroll' },
              ]}
            />
          </View>
        ) : null}

        {comicsOptions ? (
          <>
            <View>
              <SectionLabel>LAYOUT</SectionLabel>
              <Choice
                value={comicsOptions.spread}
                onChange={comicsOptions.setSpread}
                options={[
                  { value: 'single', label: 'Single' },
                  { value: 'spread', label: 'Spread' },
                  { value: 'webtoon', label: 'Webtoon' },
                ]}
              />
            </View>
            <View>
              <SectionLabel>DIRECTION</SectionLabel>
              <Choice
                value={comicsOptions.direction}
                onChange={comicsOptions.setDirection}
                options={[
                  { value: 'ltr', label: 'L → R' },
                  { value: 'rtl', label: 'R → L' },
                ]}
              />
            </View>
          </>
        ) : null}

        {audioOptions ? (
          <>
            <View>
              <SectionLabel>SPEED</SectionLabel>
              <Pressable
                testID="reader-audio-speed"
                accessibilityRole="button"
                onPress={audioOptions.cycleRate}
                style={{
                  alignSelf: 'flex-start',
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: palette.line2,
                }}
              >
                <Text style={[text.mono, { color: palette.ink }]}>
                  {audioOptions.rate.toFixed(2)}×
                </Text>
              </Pressable>
            </View>
            <View>
              <SectionLabel>SLEEP TIMER</SectionLabel>
              <Choice
                value={
                  SLEEP_CHOICES.find((c) => c.minutes === audioOptions.sleepMinutes)?.value ?? 'off'
                }
                onChange={(v) =>
                  audioOptions.setSleepMinutes(
                    SLEEP_CHOICES.find((c) => c.value === v)?.minutes ?? null,
                  )
                }
                options={SLEEP_CHOICES.map((c) => ({ value: c.value, label: c.label }))}
              />
            </View>
          </>
        ) : null}
      </View>
    </BottomSheet>
  );
}
