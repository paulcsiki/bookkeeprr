'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Checkbox } from '@/components/ui/checkbox';
import { SettingsSection, SettingRow } from '@/components/shell/SettingsSection';
import { useUnsavedChanges } from '@/components/hooks/useUnsavedChanges';
import { apiFetch } from '@/lib/api-fetch';
import { toast } from 'sonner';
import type { ScoringWeights, AdultFilter } from '@/server/db/settings/matcher';

export type MatcherInitial = {
  weights: ScoringWeights;
  adultFilter: AdultFilter;
};

type Section = 'weights' | 'adult-filter';

export function MatcherForm({ initial }: { initial: MatcherInitial }): React.JSX.Element {
  const [weights, setWeights] = useState<ScoringWeights>(initial.weights);
  const [adultFilter, setAdultFilter] = useState<AdultFilter>(initial.adultFilter);
  const [blockedRaw, setBlockedRaw] = useState<string>(
    initial.adultFilter.blockedCategories.join(', '),
  );
  // Saved baseline per section; re-set on each section's successful save.
  const [savedWeights, setSavedWeights] = useState<ScoringWeights>(initial.weights);
  const [savedAdultFilter, setSavedAdultFilter] = useState<AdultFilter>(initial.adultFilter);
  const [pending, setPending] = useState(false);

  function parseBlocked(raw: string): string[] {
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  const dirty =
    JSON.stringify(weights) !== JSON.stringify(savedWeights) ||
    adultFilter.enabled !== savedAdultFilter.enabled ||
    JSON.stringify(parseBlocked(blockedRaw)) !==
      JSON.stringify(savedAdultFilter.blockedCategories);
  useUnsavedChanges(dirty);

  async function saveSection<T>(
    section: Section,
    body: T,
    apply: (next: T) => void,
  ): Promise<void> {
    setPending(true);
    try {
      const r = await apiFetch(`/api/settings/matcher/${section}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const text = await r.text();
        toast.error(`Save failed (${r.status}): ${text}`);
        return;
      }
      const data = (await r.json()) as {
        config: T;
        autoReplayEnqueued?: { runId: number } | { error: string };
      };
      apply(data.config);
      toast.success(`Saved ${section.replace('-', ' ')} settings`);
      if (data.autoReplayEnqueued && 'runId' in data.autoReplayEnqueued) {
        const runId = data.autoReplayEnqueued.runId;
        toast.info(
          <span>
            Replay started —{' '}
            <Link href={`/settings/matcher/replays/${runId}`} className="underline">
              view results →
            </Link>
          </span>,
        );
      } else if (data.autoReplayEnqueued && 'error' in data.autoReplayEnqueued) {
        toast.error(`Auto-replay couldn't start: ${data.autoReplayEnqueued.error}`);
      }
    } catch (err) {
      toast.error(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setPending(false);
    }
  }

  function saveAdultFilter(): void {
    const blockedCategories = parseBlocked(blockedRaw);
    void saveSection<AdultFilter>(
      'adult-filter',
      { enabled: adultFilter.enabled, blockedCategories },
      (next) => {
        setAdultFilter(next);
        setSavedAdultFilter(next);
        setBlockedRaw(next.blockedCategories.join(', '));
      },
    );
  }

  return (
    <div className="space-y-7">
      <SettingsSection
        name="Scoring weights"
        description={
          <>
            Weights multiplied/added during release scoring, plus the minimum-seeders floor
            applied before grabbing. Defaults are documented in <code>docs/maintain.md</code>.
          </>
        }
      >
        <div className="space-y-3">
          <Field htmlFor="mw-group-top" label="Group top weight">
            <Input
              id="mw-group-top"
              type="number"
              min={0}
              max={1000}
              value={weights.groupTopWeight}
              onChange={(e) =>
                setWeights({ ...weights, groupTopWeight: Number(e.currentTarget.value) })
              }
            />
          </Field>
          <Field htmlFor="mw-group-step" label="Group step-down per rank">
            <Input
              id="mw-group-step"
              type="number"
              min={0}
              max={100}
              value={weights.groupStepDown}
              onChange={(e) =>
                setWeights({ ...weights, groupStepDown: Number(e.currentTarget.value) })
              }
            />
          </Field>
          <Field htmlFor="mw-batch" label="Complete-batch bonus">
            <Input
              id="mw-batch"
              type="number"
              min={0}
              max={1000}
              value={weights.batchBonus}
              onChange={(e) =>
                setWeights({ ...weights, batchBonus: Number(e.currentTarget.value) })
              }
            />
          </Field>
          <Field htmlFor="mw-seeders" label="Seeder log-multiplier">
            <Input
              id="mw-seeders"
              type="number"
              min={0}
              max={100}
              value={weights.seederMultiplier}
              onChange={(e) =>
                setWeights({ ...weights, seederMultiplier: Number(e.currentTarget.value) })
              }
            />
          </Field>
          <Field htmlFor="mw-trusted" label="Trusted-uploader bonus">
            <Input
              id="mw-trusted"
              type="number"
              min={0}
              max={1000}
              value={weights.trustedBonus}
              onChange={(e) =>
                setWeights({ ...weights, trustedBonus: Number(e.currentTarget.value) })
              }
            />
          </Field>
          <Field htmlFor="mw-remake" label="Remake penalty (≤ 0)">
            <Input
              id="mw-remake"
              type="number"
              min={-1000}
              max={0}
              value={weights.remakePenalty}
              onChange={(e) =>
                setWeights({ ...weights, remakePenalty: Number(e.currentTarget.value) })
              }
            />
          </Field>
          <Field
            htmlFor="mw-min-seeders"
            label="Minimum seeders to grab"
            hint="Releases with fewer seeders are skipped — a dead torrent never completes. Set to 0 to disable."
          >
            <Input
              id="mw-min-seeders"
              type="number"
              min={0}
              max={10000}
              value={weights.minSeeders}
              onChange={(e) =>
                setWeights({ ...weights, minSeeders: Number(e.currentTarget.value) })
              }
            />
          </Field>
          <Button
            onClick={() =>
              saveSection('weights', weights, (next) => {
                setWeights(next);
                setSavedWeights(next);
              })
            }
            disabled={pending}
          >
            {pending ? 'Saving…' : 'Save weights'}
          </Button>
        </div>
      </SettingsSection>

      <SettingsSection
        name="Adult content filter"
        description="When enabled, releases whose indexer category is in the blocklist are excluded from matching. Defaults block nyaa adult/hentai categories."
      >
        <SettingRow
          label="Filter adult content"
          control={
            <Checkbox
              id="mw-adult-enabled"
              checked={adultFilter.enabled}
              onCheckedChange={(v) => setAdultFilter({ ...adultFilter, enabled: Boolean(v) })}
            />
          }
        />
        <div className="space-y-3 pt-4">
          <Field htmlFor="mw-blocked" label="Blocked categories (comma-separated)">
            <Input
              id="mw-blocked"
              type="text"
              value={blockedRaw}
              onChange={(e) => setBlockedRaw(e.currentTarget.value)}
              placeholder="4_1, 4_2, 4_3, 4_4"
            />
          </Field>
          <Button onClick={saveAdultFilter} disabled={pending}>
            {pending ? 'Saving…' : 'Save adult filter'}
          </Button>
        </div>
      </SettingsSection>
    </div>
  );
}
