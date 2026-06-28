import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ArrowLeft } from 'lucide-react-native';
import { ScreenContainer } from '@/components/ScreenContainer';
import { InlineAlert } from '@/components/InlineAlert';
import { useTokens } from '@/theme/ThemeProvider';
import { text } from '@/theme/typography';
import { useLayout } from '@/responsive/useLayout';
import { SplitView } from '@/responsive/SplitView';
import { useMe, useLogFiles } from '@/api/hooks';
import type { LogFileInfo } from '@/api/schemas';
import { LogTailViewer } from '@/features/settings/logs/LogTailViewer';
import { useIsOnline } from '@/features/system/online';
import { SettingsOfflineState } from '@/features/settings/SettingsOfflineState';

const TRANSPARENT = 'transparent';

function FileButton({
  file,
  active,
  onPress,
}: {
  file: LogFileInfo;
  active: boolean;
  onPress: () => void;
}) {
  const t = useTokens();
  return (
    <Pressable
      testID={`log-file-${file.name}`}
      onPress={onPress}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 10,
        backgroundColor: active ? t.surfaceMuted : TRANSPARENT,
        borderWidth: 1,
        borderColor: active ? t.primary : t.border,
        gap: 2,
      }}
    >
      <Text style={[text.mono, { color: t.text }]} numberOfLines={1}>
        {file.name}
      </Text>
      <Text style={[text.monoSm, { color: t.textMuted }]}>{file.sizeBytes} B</Text>
    </Pressable>
  );
}

export default function Logs() {
  const t = useTokens();
  const navigation = useNavigation();
  const layout = useLayout();
  const me = useMe();
  const isAdmin = me.data?.role === 'admin';
  const online = useIsOnline();

  const files = useLogFiles();
  const list = files.data?.files ?? [];

  const [selected, setSelected] = useState<string | null>(null);

  // Auto-select the newest file (highest mtime) once the list loads.
  useEffect(() => {
    if (selected != null || list.length === 0) return;
    const newest = [...list].sort((a, b) => b.mtime - a.mtime)[0];
    if (newest) setSelected(newest.name);
  }, [list, selected]);

  const header = (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', paddingTop: 16, paddingBottom: 12, gap: 10 }}
    >
      <Pressable testID="btn-back-logs" onPress={() => navigation.goBack()} hitSlop={8}>
        <ArrowLeft size={22} color={t.text} strokeWidth={1.75} />
      </Pressable>
      <Text style={[text.displayMd, { flex: 1, color: t.text }]}>Logs</Text>
    </View>
  );

  if (me.data !== undefined && !isAdmin) {
    return (
      <ScreenContainer testID="screen-logs">
        {header}
        <View style={{ paddingHorizontal: 4, paddingTop: 8 }}>
          <InlineAlert
            tone="info"
            body="Logs require an administrator account."
            testID="logs-readonly-note"
          />
        </View>
      </ScreenContainer>
    );
  }

  if (!online && files.data === undefined) {
    return (
      <ScreenContainer testID="screen-logs">
        {header}
        <SettingsOfflineState />
      </ScreenContainer>
    );
  }

  const fileList = (
    <ScrollView contentContainerStyle={{ gap: 8, paddingBottom: 24 }}>
      {files.isLoading ? (
        <Text style={[text.bodySm, { color: t.textMuted, padding: 24, textAlign: 'center' }]}>
          Loading…
        </Text>
      ) : list.length === 0 ? (
        <Text style={[text.bodySm, { color: t.textMuted, padding: 24, textAlign: 'center' }]}>
          No log files.
        </Text>
      ) : (
        list.map((f) => (
          <FileButton
            key={f.name}
            file={f}
            active={selected === f.name}
            onPress={() => setSelected(f.name)}
          />
        ))
      )}
    </ScrollView>
  );

  const viewer = selected ? (
    <LogTailViewer name={selected} />
  ) : (
    <View style={{ flex: 1, justifyContent: 'center' }}>
      <Text style={[text.bodySm, { color: t.textMuted, textAlign: 'center' }]}>
        Select a log file.
      </Text>
    </View>
  );

  if (layout.isLandscape) {
    return (
      <ScreenContainer testID="screen-logs">
        {header}
        <SplitView testID="logs-split" left={fileList} right={viewer} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer testID="screen-logs">
      {header}
      <View style={{ paddingBottom: 8 }}>{fileList}</View>
      <View style={{ flex: 1 }}>{viewer}</View>
    </ScreenContainer>
  );
}
