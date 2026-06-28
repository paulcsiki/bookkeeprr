import { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { useTokens } from '@/theme/ThemeProvider';
import { text } from '@/theme/typography';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { InlineAlert } from '@/components/InlineAlert';
import {
  useProwlarrConfig,
  useSaveProwlarr,
  useTestProwlarr,
  useSyncProwlarr,
} from '@/api/hooks';

type Result =
  | { kind: 'test'; ok: boolean }
  | { kind: 'sync'; added: number; updated: number; disabled: number };

export function ProwlarrCard() {
  const t = useTokens();
  const q = useProwlarrConfig();
  const save = useSaveProwlarr();
  const testMut = useTestProwlarr();
  const syncMut = useSyncProwlarr();

  const config = q.data;

  const [url, setUrl] = useState('');
  // The apiKey field is secure and starts blank; a blank value on save tells the
  // server to keep the stored key. We track whether a key is already stored
  // (config.apiKey === '****') to render the "key is set" indicator.
  const [apiKey, setApiKey] = useState('');
  const [seeded, setSeeded] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    if (config && !seeded) {
      setUrl(config.url);
      setApiKey('');
      setSeeded(true);
    }
  }, [config, seeded]);

  const keyIsSet = config?.apiKey === '****';

  if (q.isLoading || config === undefined || !seeded) {
    return (
      <Text style={[text.bodySm, { color: t.textMuted, paddingVertical: 16 }]}>Loading…</Text>
    );
  }

  function onSave() {
    save.mutate(
      { url, apiKey },
      {
        onSuccess: () => {
          setSeeded(false); // Re-seed (and re-blank the key) from the next GET.
          setResult(null);
        },
      },
    );
  }

  function onTest() {
    const u = url.trim();
    const k = apiKey.trim();
    testMut.mutate(
      {
        ...(u.length > 0 ? { url: u } : {}),
        ...(k.length > 0 ? { apiKey: k } : {}),
      },
      {
        onSuccess: (r) => setResult({ kind: 'test', ok: r.ok }),
        onError: () => setResult({ kind: 'test', ok: false }),
      },
    );
  }

  function onSync() {
    const u = url.trim();
    const k = apiKey.trim();
    syncMut.mutate(
      {
        ...(u.length > 0 ? { url: u } : {}),
        ...(k.length > 0 ? { apiKey: k } : {}),
      },
      {
        onSuccess: (r) =>
          setResult({ kind: 'sync', added: r.added, updated: r.updated, disabled: r.disabled }),
      },
    );
  }

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: t.border,
        borderRadius: 14,
        backgroundColor: t.surface,
        padding: 16,
        gap: 14,
        marginTop: 8,
      }}
    >
      <Text style={[text.label, { color: t.text }]}>Prowlarr</Text>
      <Text style={[text.bodySm, { color: t.textMuted }]}>
        Connect Prowlarr to auto-import Torznab indexers.
      </Text>

      <TextField
        testID="prowlarr-url"
        label="URL"
        value={url}
        onChangeText={(v) => {
          setUrl(v);
          setResult(null);
        }}
        placeholder="http://prowlarr:9696"
        autoCapitalize="none"
        autoCorrect={false}
      />

      <TextField
        testID="prowlarr-apikey"
        label="API key"
        value={apiKey}
        onChangeText={(v) => {
          setApiKey(v);
          setResult(null);
        }}
        placeholder={keyIsSet ? '•••• (leave blank to keep)' : ''}
        {...(keyIsSet ? { helper: 'A key is set — leave blank to keep it.' } : {})}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
      />

      <Button
        testID="prowlarr-save"
        label={save.isPending ? 'Saving…' : 'Save'}
        onPress={onSave}
        disabled={save.isPending}
      />
      <Button
        testID="prowlarr-test"
        label={testMut.isPending ? 'Testing…' : 'Test'}
        variant="secondary"
        onPress={onTest}
        disabled={testMut.isPending}
      />
      <Button
        testID="prowlarr-sync"
        label={syncMut.isPending ? 'Syncing…' : 'Sync now'}
        variant="secondary"
        onPress={onSync}
        disabled={syncMut.isPending}
      />

      {result !== null ? (
        <InlineAlert
          testID="prowlarr-result"
          tone={result.kind === 'test' && !result.ok ? 'err' : 'info'}
          body={
            result.kind === 'test'
              ? result.ok
                ? 'Connection successful.'
                : 'Connection test failed.'
              : `added ${result.added} · updated ${result.updated} · disabled ${result.disabled}`
          }
        />
      ) : null}
    </View>
  );
}
