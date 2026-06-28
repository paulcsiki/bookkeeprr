import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ArrowLeft } from 'lucide-react-native';
import { NAMING_KEYS, type NamingKey } from '@bookkeeprr/logic';
import { CONTENT_TYPES, type ContentType } from '@bookkeeprr/types/pure';
import { ScreenContainer } from '@/components/ScreenContainer';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { InlineAlert } from '@/components/InlineAlert';
import { BottomSheet } from '@/components/BottomSheet';
import { Chip } from '@/components/Chip';
import { useTokens } from '@/theme/ThemeProvider';
import { text, fonts } from '@/theme/typography';
import { useMe, useNamingTemplates, useSaveNaming } from '@/api/hooks';
import type { NamingTemplates } from '@/api/schemas';
import { previewFor } from '@/features/settings/naming/preview';
import { useIsOnline, useOnlineGate } from '@/features/system/online';
import { SettingsOfflineState } from '@/features/settings/SettingsOfflineState';

// Human labels for the five media content types (canonical server vocabulary).
const TYPE_LABEL: Record<ContentType, string> = {
  manga: 'Manga',
  comic: 'Comic',
  light_novel: 'Light Novel',
  ebook: 'eBook',
  audiobook: 'Audiobook',
};

// Map the canonical content type → the Chip's accent "kind" (which uses the
// mobile-internal novel/audio vocabulary).
const CHIP_KIND = {
  manga: 'manga',
  comic: 'comic',
  light_novel: 'novel',
  ebook: 'ebook',
  audiobook: 'audio',
} as const;

const FIELD_LABEL: Record<NamingKey, string> = {
  series_folder: 'Series folder',
  volume: 'Volume file',
  chapter: 'Chapter file',
  batch: 'Batch file',
  volume_subfolder: 'Volume subfolder',
};

function templatesEqual(a: NamingTemplates, b: NamingTemplates): boolean {
  return NAMING_KEYS.every((key) => a[key] === b[key]);
}

// Editing form for a single content type. Keyed on `contentType` by the parent
// so switching types remounts it with fresh, server-seeded values.
function NamingTemplatesForm({
  contentType,
  initial,
  onDirtyChange,
  registerDiscard,
}: {
  contentType: ContentType;
  initial: NamingTemplates;
  onDirtyChange: (dirty: boolean) => void;
  registerDiscard: (fn: (() => void) | null) => void;
}) {
  const t = useTokens();
  const save = useSaveNaming(contentType);
  const { gate, disabledProps } = useOnlineGate();
  const [values, setValues] = useState<NamingTemplates>(initial);

  const dirty = useMemo(() => !templatesEqual(values, initial), [values, initial]);

  // Surface dirty state + a discard handler to the parent (used by the
  // confirm-discard sheet when switching content types).
  useEffect(() => {
    onDirtyChange(dirty);
    registerDiscard(dirty ? () => setValues(initial) : null);
  }, [dirty, initial, onDirtyChange, registerDiscard]);

  const allValid = useMemo(
    () =>
      NAMING_KEYS.every((key) => {
        if (key === 'volume_subfolder' && values[key] === '') return true;
        return previewFor(key, values[key], contentType).ok;
      }),
    [values, contentType],
  );

  const onSave = () => {
    if (!allValid) return;
    save.mutate(values);
  };

  return (
    <View style={{ gap: 16, paddingTop: 18 }}>
      {NAMING_KEYS.map((key) => {
        const result = previewFor(key, values[key], contentType);
        return (
          <View key={key} style={{ gap: 6 }}>
            <TextField
              testID={`naming-input-${key}`}
              label={FIELD_LABEL[key]}
              value={values[key]}
              onChangeText={(next) => setValues((v) => ({ ...v, [key]: next }))}
              autoCapitalize="none"
              autoCorrect={false}
              {...(result.ok ? {} : { error: result.error })}
            />
            <Text
              testID={`naming-preview-${key}`}
              style={{
                fontFamily: fonts.mono.regular,
                fontSize: 11,
                lineHeight: 15,
                color: result.ok ? t.ok : t.errFg,
              }}
            >
              {result.ok ? `Preview: ${result.preview || '(empty)'}` : `Error: ${result.error}`}
            </Text>
          </View>
        );
      })}

      {save.isError ? (
        <InlineAlert tone="err" body="Couldn't save the templates." testID="naming-save-error" />
      ) : null}

      <Button
        testID="naming-save"
        label={save.isPending ? 'Saving…' : 'Save templates'}
        onPress={gate(onSave)}
        disabled={!dirty || !allValid || save.isPending || disabledProps.disabled}
      />
    </View>
  );
}

function NamingAdminView() {
  const t = useTokens();
  const [contentType, setContentType] = useState<ContentType>('manga');
  const [dirty, setDirty] = useState(false);
  // The discard fn for the current form (set when dirty), and the type the user
  // wants to switch to once they confirm discarding.
  const [discard, setDiscard] = useState<(() => void) | null>(null);
  const [pendingSwitch, setPendingSwitch] = useState<ContentType | null>(null);

  const q = useNamingTemplates(contentType);
  const online = useIsOnline();

  // Stable callbacks so the child form's effect doesn't re-fire every render.
  const registerDiscard = useCallback((fn: (() => void) | null) => setDiscard(() => fn), []);

  const handleSelect = (next: ContentType) => {
    if (next === contentType) return;
    if (dirty) {
      setPendingSwitch(next);
      return;
    }
    setContentType(next);
  };

  const confirmDiscard = () => {
    const next = pendingSwitch;
    setPendingSwitch(null);
    discard?.();
    setDirty(false);
    if (next) setContentType(next);
  };

  if (!online && q.data === undefined) return <SettingsOfflineState />;

  return (
    <>
      <ScrollView contentContainerStyle={{ paddingBottom: 48, paddingHorizontal: 4 }}>
        {/* Content-type selector. */}
        <View
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 8 }}
        >
          {CONTENT_TYPES.map((ct) => (
            <Chip
              key={ct}
              testID={`naming-ct-${ct}`}
              active={ct === contentType}
              kind={CHIP_KIND[ct]}
              onPress={() => handleSelect(ct)}
            >
              {TYPE_LABEL[ct]}
            </Chip>
          ))}
        </View>

        {q.isLoading || q.data === undefined ? (
          q.isError ? (
            <View style={{ paddingTop: 18 }}>
              <InlineAlert
                tone="err"
                body="Couldn't load naming templates."
                testID="naming-load-error"
              />
            </View>
          ) : (
            <Text
              style={[text.bodySm, { color: t.textMuted, padding: 24, textAlign: 'center' }]}
            >
              Loading…
            </Text>
          )
        ) : (
          <NamingTemplatesForm
            key={contentType}
            contentType={contentType}
            initial={q.data.templates}
            onDirtyChange={setDirty}
            registerDiscard={registerDiscard}
          />
        )}
      </ScrollView>

      {pendingSwitch !== null ? (
        <BottomSheet testID="naming-discard-sheet" onDismiss={() => setPendingSwitch(null)}>
          <View style={{ gap: 14, paddingHorizontal: 18 }}>
            <Text style={[text.displaySm, { color: t.text }]}>Discard unsaved changes?</Text>
            <Text style={[text.bodySm, { color: t.textMuted }]}>
              You&apos;ve edited the {TYPE_LABEL[contentType]} templates but haven&apos;t saved.
            </Text>
            <Button
              testID="naming-discard-confirm"
              label="Discard & switch"
              onPress={confirmDiscard}
            />
            <Button
              testID="naming-discard-cancel"
              label="Keep editing"
              variant="ghost"
              onPress={() => setPendingSwitch(null)}
            />
          </View>
        </BottomSheet>
      ) : null}
    </>
  );
}

export default function Naming() {
  const t = useTokens();
  const navigation = useNavigation();
  const me = useMe();
  const isAdmin = me.data?.role === 'admin';

  return (
    <ScreenContainer testID="screen-naming">
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingTop: 16,
          paddingBottom: 12,
          gap: 10,
        }}
      >
        <Pressable testID="btn-back-naming" onPress={() => navigation.goBack()} hitSlop={8}>
          <ArrowLeft size={22} color={t.text} strokeWidth={1.75} />
        </Pressable>
        <Text style={[text.displayMd, { flex: 1, color: t.text }]}>Naming</Text>
      </View>
      {me.data !== undefined && !isAdmin ? (
        <View style={{ paddingHorizontal: 4, paddingTop: 8 }}>
          <InlineAlert
            tone="info"
            body="Naming settings require an administrator account."
            testID="naming-readonly-note"
          />
        </View>
      ) : isAdmin ? (
        <NamingAdminView />
      ) : null}
    </ScreenContainer>
  );
}
