import { useEffect, useMemo, useState } from 'react';
import { AppConfig } from '@/lib/appConfig';
import { useChangelogStore } from '@/state/changelogStore';
import { getVersionEntry } from '@/lib/changelog';
import { useChangelogSeen } from '@/api/hooks';
import { ChangelogModal } from './ChangelogModal';

export function ChangelogTrigger() {
  const { lastSeen, hydrated, hydrate, setLastSeen } = useChangelogStore();
  const seen = useChangelogSeen();
  const mobile = AppConfig.version;
  const [shown, setShown] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    if (!hydrated) hydrate();
  }, [hydrated, hydrate]);

  const entry = useMemo(() => getVersionEntry(mobile), [mobile]);

  // Decide whether to show:
  // - Fresh install (lastSeen === null): set lastSeen to current immediately, do not show.
  // - Upgrade (lastSeen !== current): show.
  // - Same as current or already shown this session: do not show.
  useEffect(() => {
    if (!hydrated || shown || acknowledged) return;
    if (process.env.EXPO_PUBLIC_MOBILE_E2E_FORCE_CHANGELOG === '1' && entry) {
      setShown(true);
      return;
    }
    if (lastSeen === null) {
      setLastSeen(mobile).catch(() => {});
      return;
    }
    if (lastSeen !== mobile && entry) {
      setShown(true);
    }
  }, [hydrated, lastSeen, mobile, entry, shown, acknowledged, setLastSeen]);

  const onDismiss = () => {
    setAcknowledged(true);
    setShown(false);
    setLastSeen(mobile).catch(() => {});
    seen.markSeen(mobile);
  };

  if (!shown || !entry) return null;
  return <ChangelogModal entry={entry} previousVersion={lastSeen} onDismiss={onDismiss} />;
}
