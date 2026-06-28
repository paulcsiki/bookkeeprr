import { View, Text, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, List, ALargeSmall, type LucideIcon } from 'lucide-react-native';
import { text } from '@/theme/typography';
import { useReaderTheme } from './ReaderThemeContext';

/** A round chrome button tinted from the reader palette. */
function ChromeButton({
  Icon,
  onPress,
  label,
  testID,
}: {
  Icon: LucideIcon;
  onPress?: (() => void) | undefined;
  label: string;
  testID?: string | undefined;
}) {
  const { palette } = useReaderTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 38,
        height: 38,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Icon size={20} color={palette.inkSoft} strokeWidth={1.7} />
    </Pressable>
  );
}

export interface ReaderChromeProps {
  title: string;
  /** Secondary line — chapter title or author. */
  subtitle?: string | undefined;
  onBack: () => void;
  onTOC?: (() => void) | undefined;
  onSettings?: (() => void) | undefined;
  /**
   * Glyph for the settings button. Defaults to `ALargeSmall` ("Aa") — right for
   * text-display settings (font / size / theme). Audiobooks open a playback
   * sheet instead (speed / sleep / auto-scroll), so AudioReader overrides this
   * with a sliders glyph. Mirrors the web `ReaderTopBar`.
   */
  settingsIcon?: LucideIcon | undefined;
  /** Accessibility label for the settings button. Defaults to "Display". */
  settingsLabel?: string | undefined;
}

/**
 * Reader top bar — back chevron · centred title/subtitle · TOC + settings.
 * Themed entirely from the reader palette (RN has no CSS vars). The title uses
 * the display font; the subtitle uses mono (it carries facts like chapter /
 * author). Matches the web `ReaderTopBar` shape.
 */
export function ReaderChrome({
  title,
  subtitle,
  onBack,
  onTOC,
  onSettings,
  settingsIcon = ALargeSmall,
  settingsLabel = 'Display',
}: ReaderChromeProps) {
  const { palette } = useReaderTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        // Sit below the status bar / notch — the reader has no native header.
        paddingTop: insets.top + 8,
        paddingBottom: 8,
        backgroundColor: palette.chrome,
        borderBottomWidth: 1,
        borderBottomColor: palette.line,
      }}
    >
      <ChromeButton testID="reader-back" Icon={ChevronLeft} onPress={onBack} label="Back" />
      <View style={{ flex: 1, minWidth: 0, paddingHorizontal: 4 }}>
        <Text
          numberOfLines={1}
          style={[text.displaySm, { color: palette.ink, textAlign: 'center' }]}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            numberOfLines={1}
            style={[text.monoSm, { color: palette.inkSoft, textAlign: 'center', marginTop: 2 }]}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      <ChromeButton testID="reader-toc-btn" Icon={List} onPress={onTOC} label="Contents" />
      <ChromeButton
        testID="reader-settings-btn"
        Icon={settingsIcon}
        onPress={onSettings}
        label={settingsLabel}
      />
    </View>
  );
}
