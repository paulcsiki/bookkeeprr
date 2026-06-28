'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api-fetch';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shell/PageHeader';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';

type TermsView = {
  eulaVersion: string;
  eulaUrl: string;
  privacyVersion: string;
  privacyUrl: string;
  effectiveAt: string;
};

export function CloudConnectForm({ cloudBaseUrl }: { cloudBaseUrl: string }): React.JSX.Element {
  const router = useRouter();
  const [eulaOk, setEulaOk] = useState(false);
  const [privacyOk, setPrivacyOk] = useState(false);
  const [terms, setTerms] = useState<TermsView | null>(null);
  const [termsError, setTermsError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await apiFetch('/api/settings/cloud/terms');
        if (!r.ok) {
          const body = (await r.json().catch(() => ({ message: 'Could not fetch terms' }))) as {
            message?: string;
          };
          if (!cancelled) setTermsError(body.message ?? 'Could not fetch terms');
          return;
        }
        const body = (await r.json()) as { terms: TermsView };
        if (!cancelled) setTerms(body.terms);
      } catch (err) {
        if (!cancelled) {
          setTermsError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const ready = terms !== null && eulaOk && privacyOk;

  async function onConnect(): Promise<void> {
    if (!terms || !eulaOk || !privacyOk) return;
    setPending(true);
    try {
      const r = await apiFetch('/api/settings/cloud/connect', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          acceptedEulaVersion: terms.eulaVersion,
          acceptedPrivacyVersion: terms.privacyVersion,
        }),
      });
      if (!r.ok) {
        const errBody = (await r.json().catch(() => ({ message: 'Connect failed' }))) as {
          message?: string;
        };
        toast.error(errBody.message ?? 'Connect failed');
        return;
      }
      toast.success('Connected to cloud');
      // /settings/cloud is force-dynamic: navigating there re-runs the server
      // page (cloudSettings.get → fresh CloudSettingsForm seed), so the
      // connected state shows on return without an explicit router.refresh().
      router.push('/settings/cloud');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Connect to cloud"
        subtitle={`Connecting registers this installation with ${cloudBaseUrl} and provisions a tenant ID. Push notifications and remote device features will be enabled.`}
        actions={
          <Button variant="ghost" onClick={() => router.push('/settings/cloud')}>
            ← Back
          </Button>
        }
      />

      <div className="space-y-3 text-sm">
        {termsError ? (
          <div className="text-destructive text-xs">
            Could not fetch terms from cloud: {termsError}
          </div>
        ) : null}

        {terms ? (
          <>
            <div className="text-xs text-muted-foreground">
              Effective: {new Date(terms.effectiveAt).toLocaleDateString()}
            </div>
            <label className="flex items-start gap-2 cursor-pointer">
              <Checkbox
                checked={eulaOk}
                onCheckedChange={(v) => setEulaOk(v === true)}
                className="mt-0.5"
              />
              <span>
                I agree to the{' '}
                <a
                  href={terms.eulaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline-offset-4 hover:underline"
                >
                  EULA v{terms.eulaVersion}
                </a>
              </span>
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <Checkbox
                checked={privacyOk}
                onCheckedChange={(v) => setPrivacyOk(v === true)}
                className="mt-0.5"
              />
              <span>
                I agree to the{' '}
                <a
                  href={terms.privacyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline-offset-4 hover:underline"
                >
                  Privacy Policy v{terms.privacyVersion}
                </a>
              </span>
            </label>
          </>
        ) : termsError === null ? (
          <div className="text-xs text-muted-foreground">Loading terms…</div>
        ) : null}
      </div>

      <Button onClick={onConnect} disabled={!ready || pending}>
        {pending ? 'Connecting…' : 'Connect'}
      </Button>
    </div>
  );
}
