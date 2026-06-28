import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, View, Text, TextInput } from 'react-native';
import { useTokens } from '@/theme/ThemeProvider';
import { text, fonts } from '@/theme/typography';
import { BottomSheet } from '@/components/BottomSheet';
import { Button } from '@/components/Button';
import { InlineAlert } from '@/components/InlineAlert';
import { useManualGrab, manualGrabErrorMessage } from '@/api/hooks';
import { useOnlineGate } from '@/features/system/online';

interface Props {
  seriesId: number;
  onClose: () => void;
  /** Called after the server accepted the magnet (sheet should close). */
  onGrabbed: () => void;
}

/**
 * Paste-a-magnet-link sheet for a series. Mobile is magnet-only: a .torrent
 * file picker would need a new native document-picker dependency, which is
 * off-limits without sign-off.
 *
 * Hosted in a transparent Modal (CustomizeSheet / ContinueReadingRail
 * pattern): the entry point lives inside the screen's ScrollView content, so
 * a plain-sibling BottomSheet would render squashed at the button's position
 * instead of sliding over the full window.
 */
export function ManualGrabSheet({ seriesId, onClose, onGrabbed }: Props) {
  const t = useTokens();
  const grab = useManualGrab();
  const { gate, disabledProps } = useOnlineGate();
  const [magnet, setMagnet] = useState('');
  const [error, setError] = useState<string | null>(null);

  function onSubmit() {
    const value = magnet.trim();
    // Client-side sanity check — don't bother the server with obvious junk.
    if (!value.startsWith('magnet:?')) {
      setError("That magnet link doesn't look valid.");
      return;
    }
    setError(null);
    grab.mutate(
      { seriesId, magnet: value },
      {
        onSuccess: () => onGrabbed(),
        onError: (e) => setError(manualGrabErrorMessage(e)),
      },
    );
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      {/* The sheet hugs the bottom edge, so the iOS keyboard covers the
          submit/cancel buttons while the magnet input is focused. Pad the
          sheet above the keyboard; Android resizes the window itself
          (adjustResize), so padding there would double-shift. */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <BottomSheet testID="manual-grab-sheet" onDismiss={onClose}>
          <View style={{ paddingHorizontal: 18, paddingTop: 4, paddingBottom: 8, gap: 14 }}>
            <Text style={[text.displaySm, { color: t.text }]}>Add magnet link</Text>
            <Text style={[text.bodySm, { color: t.textMuted }]}>
              Paste a magnet link for this title and it goes through the normal download pipeline.
            </Text>
            <TextInput
              testID="input-magnet"
              value={magnet}
              onChangeText={(v) => {
                setMagnet(v);
                setError(null);
              }}
              placeholder="magnet:?xt=urn:btih:…"
              placeholderTextColor={t.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              multiline
              textAlignVertical="top"
              style={{
                minHeight: 88,
                color: t.text,
                backgroundColor: t.surface,
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 12,
                borderWidth: 1,
                borderColor: error !== null ? t.errFg : t.border,
                fontFamily: fonts.mono.regular,
                fontSize: 13,
                lineHeight: 18,
              }}
            />
            {error !== null ? (
              <InlineAlert tone="err" body={error} testID="manual-grab-error" />
            ) : null}
            <View style={{ gap: 10, marginTop: 2 }}>
              <Button
                testID="manual-grab-submit"
                label={grab.isPending ? 'Sending…' : 'Add to downloads'}
                onPress={gate(onSubmit)}
                // `grab.isPending` / empty-magnet truly block the press (in-flight
                // or nothing to send). The offline disable must NOT block the press
                // — it still fires so the gated `onSubmit` can toast "Unavailable
                // offline" — but the control must read as disabled to accessibility
                // and be dimmed. Passing `disabled={undefined}` (not `false`) keeps
                // Pressable from forcing `accessibilityState.disabled`, letting the
                // explicit one govern it.
                disabled={grab.isPending || magnet.trim().length === 0 || undefined}
                accessibilityState={{
                  disabled:
                    grab.isPending || magnet.trim().length === 0 || disabledProps.disabled,
                }}
                style={{ opacity: disabledProps.disabled ? 0.45 : undefined }}
              />
              <Button
                testID="manual-grab-cancel"
                label="Cancel"
                variant="ghost"
                onPress={onClose}
              />
            </View>
          </View>
        </BottomSheet>
      </KeyboardAvoidingView>
    </Modal>
  );
}
