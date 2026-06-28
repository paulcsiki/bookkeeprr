import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, View, Text } from 'react-native';
import { AlertTriangle } from 'lucide-react-native';
import { AppConfig } from '@/lib/appConfig';
import { fetchVersion } from '@/api/anon-client';
import { useAuth } from '@/auth/AuthContext';
import { useTokens } from '@/theme/ThemeProvider';
import { fonts, text } from '@/theme/typography';
import { withAlpha } from '@/theme/color';
import { Button } from '@/components/Button';

function compare(a: string, b: string): number {
  const pa = a.split('.').map((x) => parseInt(x, 10));
  const pb = b.split('.').map((x) => parseInt(x, 10));
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

export function VersionGate({ children }: { children: ReactNode }) {
  const { state, signOut } = useAuth();
  const t = useTokens();
  const [blocked, setBlocked] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<'compatible' | 'still_blocked' | null>(null);
  const mine = AppConfig.version;

  useEffect(() => {
    if (state.status !== 'authenticated') return;
    fetchVersion(state.creds.serverUrl)
      .then((v) => {
        if (compare(mine, v.min_supported) < 0) setBlocked(true);
      })
      .catch(() => {
        /* network failure does not block — user can still try */
      });
  }, [state, mine]);

  async function onCheckAgain() {
    if (state.status !== 'authenticated') return;
    setChecking(true);
    setCheckResult(null);
    try {
      const v = await fetchVersion(state.creds.serverUrl);
      if (compare(mine, v.min_supported) >= 0) {
        setBlocked(false);
        setCheckResult('compatible');
      } else {
        setCheckResult('still_blocked');
      }
    } catch {
      setCheckResult('still_blocked');
    } finally {
      setChecking(false);
    }
  }

  if (blocked) {
    return (
      <View
        style={{
          flex: 1,
          padding: 24,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: t.bg,
          gap: 14,
        }}
      >
        <View
          style={{
            width: 60,
            height: 60,
            borderRadius: 30,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: withAlpha(t.warn, 0.16),
            borderWidth: 1,
            borderColor: withAlpha(t.warn, 0.35),
          }}
        >
          <AlertTriangle size={26} color={t.warn} strokeWidth={2} />
        </View>
        <Text style={{ fontFamily: fonts.mono.regular, fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', color: t.textMuted }}>
          Server too old
        </Text>
        <Text style={[text.displayMd, { color: t.text }]}>Update required</Text>
        <Text style={[text.bodySm, { color: t.textMuted, textAlign: 'center', maxWidth: 320, lineHeight: 19 }]}>
          This server requires a newer version of the bookkeeprr mobile app. Update from the GitHub Releases page.
        </Text>

        <View
          style={{
            width: '100%',
            maxWidth: 360,
            marginTop: 8,
            borderWidth: 1,
            borderColor: t.border,
            borderRadius: 12,
            backgroundColor: t.surface,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: t.border }}>
            <Text style={{ fontFamily: fonts.sans.regular, fontSize: 12, color: t.textMuted }}>This app</Text>
            <Text style={{ fontFamily: fonts.mono.regular, fontSize: 12, color: t.text }}>{mine}</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10 }}>
            <Text style={{ fontFamily: fonts.sans.regular, fontSize: 12, color: t.textMuted }}>Server requires ≥</Text>
            <Text style={{ fontFamily: fonts.mono.regular, fontSize: 12, color: t.warn }}>(too new)</Text>
          </View>
        </View>

        {checkResult === 'still_blocked' ? (
          <Text style={[text.bodySm, { color: t.errFg, textAlign: 'center' }]}>
            Server still requires a newer app version.
          </Text>
        ) : null}

        <View style={{ width: '100%', maxWidth: 360, gap: 10, marginTop: 4 }}>
          <Button
            testID="btn-version-check-again"
            label={checking ? 'Checking…' : 'Check again'}
            variant="secondary"
            onPress={() => void onCheckAgain()}
            disabled={checking}
          />
          {checking ? (
            <ActivityIndicator size="small" color={t.primary} style={{ alignSelf: 'center' }} />
          ) : null}
          <Button
            testID="btn-version-switch-server"
            label="Switch server"
            variant="ghost"
            onPress={() => void signOut()}
          />
        </View>
      </View>
    );
  }
  return <>{children}</>;
}
