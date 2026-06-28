import { redirect } from 'next/navigation';
import { getActor } from '@/server/auth/get-actor';
import {
  scoringWeightsSetting,
  adultFilterSetting,
  matcherAutoReplaySetting,
} from '@/server/db/settings/matcher';
import { PageHeader } from '@/components/shell/PageHeader';
import { MatcherForm } from './MatcherForm';
import { ReplayCard } from './ReplayCard';

export const dynamic = 'force-dynamic';

export default async function SettingsMatcherPage(): Promise<React.JSX.Element> {
  const actor = await getActor();
  if (actor === null) redirect('/login?next=/settings/matcher');
  if (actor.role !== 'admin') redirect('/settings');

  const [weights, adultFilter, autoReplay] = await Promise.all([
    scoringWeightsSetting.get(),
    adultFilterSetting.get(),
    matcherAutoReplaySetting.get(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Matcher"
        subtitle="Tune how releases are scored and filtered. Changes take effect on the next indexer poll, missing-search run, or interactive search."
      />
      <MatcherForm initial={{ weights, adultFilter }} />
      <ReplayCard initialAutoReplay={autoReplay} />
    </div>
  );
}
