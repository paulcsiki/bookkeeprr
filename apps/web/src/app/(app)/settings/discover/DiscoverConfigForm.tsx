'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { SettingsSection } from '@/components/shell/SettingsSection';
import { useUnsavedChanges } from '@/components/hooks/useUnsavedChanges';
import { apiFetch } from '@/lib/api-fetch';

type TrendingSource = 'anilist' | 'mal';

type Props = {
  initialTrendingSource: TrendingSource;
  malConfigured: boolean;
};

export function DiscoverConfigForm({
  initialTrendingSource,
  malConfigured,
}: Props): React.JSX.Element {
  const [saved, setSaved] = useState<TrendingSource>(initialTrendingSource);
  const [trendingSource, setTrendingSource] = useState<TrendingSource>(initialTrendingSource);

  useUnsavedChanges(trendingSource !== saved);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const r = await apiFetch('/api/settings/discover', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ trendingSource }),
      });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        throw new Error((b as { error?: string }).error ?? `HTTP ${r.status}`);
      }
    },
    onSuccess: () => {
      setSaved(trendingSource);
      toast.success('Saved');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        saveMutation.mutate();
      }}
      className="space-y-7"
    >
      <SettingsSection
        name="Trending source"
        description="The provider that powers the Discover “Trending now” rail. AniList uses its real trending sort; MyAnimeList uses its popularity ranking."
      >
        <RadioGroup
          value={trendingSource}
          onValueChange={(v) => setTrendingSource(v as TrendingSource)}
          className="gap-4"
        >
          <div className="flex items-start gap-3">
            <RadioGroupItem value="anilist" id="trending-anilist" className="mt-0.5" />
            <div className="space-y-0.5">
              <Label htmlFor="trending-anilist" className="font-medium">
                AniList — trending
              </Label>
              <p className="text-[13px] leading-[1.55] text-muted-foreground">
                What&rsquo;s hot right now via AniList&rsquo;s <span className="font-mono">TRENDING_DESC</span>{' '}
                sort.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <RadioGroupItem
              value="mal"
              id="trending-mal"
              className="mt-0.5"
              disabled={!malConfigured}
            />
            <div className="space-y-0.5">
              <Label
                htmlFor="trending-mal"
                className={malConfigured ? 'font-medium' : 'font-medium opacity-50'}
              >
                MyAnimeList — popularity
              </Label>
              <p className="text-[13px] leading-[1.55] text-muted-foreground">
                {malConfigured ? (
                  'MyAnimeList’s all-time popularity ranking.'
                ) : (
                  <>
                    Requires a configured MyAnimeList Client ID.{' '}
                    <Link href="/settings/mal" className="underline">
                      Configure MyAnimeList
                    </Link>
                    .
                  </>
                )}
              </p>
            </div>
          </div>
        </RadioGroup>
        <div className="flex gap-2 pt-6">
          <Button type="submit" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </SettingsSection>
    </form>
  );
}
