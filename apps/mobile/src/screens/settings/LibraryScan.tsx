import { useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ArrowLeft } from 'lucide-react-native';
import { ScreenContainer } from '@/components/ScreenContainer';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { InlineAlert } from '@/components/InlineAlert';
import { useTokens } from '@/theme/ThemeProvider';
import { text } from '@/theme/typography';
import { useMe, useStartScan, useJob } from '@/api/hooks';
import { useOnlineGate } from '@/features/system/online';

function LibraryScanAdminView() {
  const t = useTokens();
  const startScan = useStartScan();
  const { gate, disabledProps } = useOnlineGate();
  const [rootPath, setRootPath] = useState('');
  const [jobId, setJobId] = useState<number | null>(null);
  const [alreadyRunning, setAlreadyRunning] = useState(false);

  // useJob must be called unconditionally (rules of hooks); jobId|null disables the query.
  const jobQuery = useJob(jobId);

  async function onRunScan() {
    setAlreadyRunning(false);
    setJobId(null);
    const result = await startScan.mutateAsync({ rootPath });
    if ('alreadyRunning' in result && result.alreadyRunning) {
      setAlreadyRunning(true);
    } else if ('jobId' in result) {
      setJobId(result.jobId);
    }
  }

  const jobStatus = jobQuery.data?.status ?? null;

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 48, paddingHorizontal: 4 }}>
      <View style={{ marginTop: 8, gap: 14 }}>
        <TextField
          testID="scan-root"
          label="Library root path"
          value={rootPath}
          onChangeText={(v) => setRootPath(v)}
          placeholder="/media/manga"
          helper="Absolute path to scan for new files"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {startScan.isError ? (
        <View style={{ marginTop: 14 }}>
          <InlineAlert
            tone="err"
            body="Couldn't start the scan."
            testID="scan-error"
          />
        </View>
      ) : null}

      <Button
        testID="scan-run"
        label={startScan.isPending ? 'Starting…' : 'Run scan'}
        onPress={gate(() => void onRunScan())}
        disabled={startScan.isPending || disabledProps.disabled}
        style={{ marginTop: 16 }}
      />

      {alreadyRunning ? (
        <View style={{ marginTop: 14 }}>
          <InlineAlert
            tone="warn"
            body="A scan is already in progress"
            testID="scan-status"
          />
        </View>
      ) : jobStatus !== null ? (
        <View style={{ marginTop: 14 }}>
          <Text
            testID="scan-status"
            style={[text.monoSm, { color: t.textMuted }]}
          >
            {jobStatus}
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

export default function LibraryScan() {
  const t = useTokens();
  const navigation = useNavigation();
  const me = useMe();
  const isAdmin = me.data?.role === 'admin';

  return (
    <ScreenContainer testID="screen-library-scan">
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingTop: 16,
          paddingBottom: 12,
          gap: 10,
        }}
      >
        <Pressable testID="btn-back-library-scan" onPress={() => navigation.goBack()} hitSlop={8}>
          <ArrowLeft size={22} color={t.text} strokeWidth={1.75} />
        </Pressable>
        <Text style={[text.displayMd, { flex: 1, color: t.text }]}>Library Scan</Text>
      </View>
      {me.data !== undefined && !isAdmin ? (
        <View style={{ paddingHorizontal: 4, paddingTop: 8 }}>
          <InlineAlert
            tone="info"
            body="Library scan requires an administrator account."
            testID="scan-readonly-note"
          />
        </View>
      ) : isAdmin ? (
        <LibraryScanAdminView />
      ) : null}
    </ScreenContainer>
  );
}
