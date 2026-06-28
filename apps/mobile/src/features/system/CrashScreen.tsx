import { useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { AlertOctagon } from 'lucide-react-native';
import { Button } from '@/components/Button';
import { useTokens } from '@/theme/ThemeProvider';
import { fonts, text } from '@/theme/typography';
import { withAlpha } from '@/theme/color';

type Props = {
  error: Error;
  onRestart: () => void;
  onSendReport?: () => void;
};

export function CrashScreen({ error, onRestart, onSendReport }: Props) {
  const t = useTokens();
  const [showStack, setShowStack] = useState(false);
  return (
    <View
      style={{
        flex: 1,
        padding: 24,
        backgroundColor: t.bg,
        justifyContent: 'center',
        gap: 14,
      }}
    >
      <View
        style={{
          alignSelf: 'center',
          width: 60,
          height: 60,
          borderRadius: 30,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: withAlpha(t.err, 0.14),
          borderWidth: 1,
          borderColor: withAlpha(t.err, 0.35),
        }}
      >
        <AlertOctagon size={26} color={t.err} strokeWidth={2} />
      </View>
      <Text style={{ fontFamily: fonts.mono.regular, fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', color: t.textMuted, textAlign: 'center' }}>
        Crash
      </Text>
      <Text style={[text.displayMd, { color: t.text, textAlign: 'center' }]}>
        Something went wrong
      </Text>
      <Text style={[text.bodySm, { color: t.textMuted, textAlign: 'center', maxWidth: 320, alignSelf: 'center', lineHeight: 19 }]}>
        {error.message || 'An unexpected error occurred. Restart the app and try again.'}
      </Text>

      <Pressable
        onPress={() => setShowStack((v) => !v)}
        style={{ alignSelf: 'center', paddingVertical: 6 }}
      >
        <Text style={{ fontFamily: fonts.mono.regular, fontSize: 11, color: t.primary }}>
          {showStack ? 'Hide details' : 'Show details'}
        </Text>
      </Pressable>
      {showStack && error.stack ? (
        <ScrollView
          style={{
            maxHeight: 200,
            borderWidth: 1,
            borderColor: t.border,
            borderRadius: 8,
            backgroundColor: t.surface,
          }}
          contentContainerStyle={{ padding: 10 }}
        >
          <Text style={{ fontFamily: fonts.mono.regular, fontSize: 10, color: t.textMuted }}>{error.stack}</Text>
        </ScrollView>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 8, alignSelf: 'center' }}>
        <Button testID="btn-crash-restart" label="Restart app" onPress={onRestart} />
        {onSendReport ? (
          <Button testID="btn-crash-report" label="Send report" variant="secondary" onPress={onSendReport} />
        ) : null}
      </View>
    </View>
  );
}
