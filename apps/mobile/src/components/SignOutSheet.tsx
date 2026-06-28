import { View, Text, Pressable } from 'react-native';
import { BottomSheet } from '@/components/BottomSheet';
import { useTokens } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/typography';

type Props = { open: boolean; onClose: () => void; onConfirm: () => void };

export function SignOutSheet({ open, onClose, onConfirm }: Props) {
  const t = useTokens();
  if (!open) return null;
  return (
    <BottomSheet onDismiss={onClose}>
      <View style={{ padding: 20, gap: 12 }}>
        <Text style={{ fontFamily: fonts.display.semibold, fontSize: 18, color: t.text }}>
          Sign out of bookkeeprr?
        </Text>
        <Text style={{ color: t.textMuted, fontSize: 13, lineHeight: 19 }}>
          You&apos;ll need to sign in again on this device.
        </Text>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
          <Pressable
            onPress={onClose}
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              height: 44,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: t.border,
            }}
          >
            <Text style={{ color: t.text, fontFamily: fonts.sans.medium }}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={onConfirm}
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              height: 44,
              borderRadius: 10,
              backgroundColor: t.err,
            }}
          >
            <Text style={{ color: t.primaryFg, fontFamily: fonts.sans.medium }}>Sign out</Text>
          </Pressable>
        </View>
      </View>
    </BottomSheet>
  );
}
