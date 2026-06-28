'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Checkbox } from '@/components/ui/checkbox';
import { SettingsSection } from '@/components/shell/SettingsSection';
import { useUnsavedChanges } from '@/components/hooks/useUnsavedChanges';
import { apiFetch } from '@/lib/api-fetch';
import { toast } from 'sonner';
import { TagTokenInput } from './TagTokenInput';

export type ForwardAuthFormConfig = {
  enabled: boolean;
  trustedProxies: string[];
  userHeader: string;
  emailHeader: string;
  groupsHeader: string;
  autoCreateUsers: boolean;
  allowedGroups: string[];
  adminGroups: string[];
};

type ValidateResponse = {
  ready: boolean;
  peerIp: string | null;
  clientIp: string | null;
  peerInTrustedProxies: boolean;
  userHeaderName: string;
  userHeaderPresent: boolean;
  userHeaderValue: string | null;
};

type ValidateError = { error: 'invalid_cidr'; invalidCidrs: string[] };

type Props = { initial: ForwardAuthFormConfig };

export function ForwardAuthForm({ initial }: Props): React.JSX.Element {
  // Saved baseline; re-set on a successful save so the form is clean afterwards.
  const [saved, setSaved] = useState<ForwardAuthFormConfig>(initial);
  const [cfg, setCfg] = useState<ForwardAuthFormConfig>(initial);
  const [pending, startTransition] = useTransition();
  const [validating, setValidating] = useState(false);
  const [validateResult, setValidateResult] = useState<ValidateResponse | null>(null);

  const dirty = JSON.stringify(cfg) !== JSON.stringify(saved);
  useUnsavedChanges(dirty);

  function patch<K extends keyof ForwardAuthFormConfig>(
    key: K,
    value: ForwardAuthFormConfig[K],
  ): void {
    setCfg((c) => ({ ...c, [key]: value }));
  }

  async function onValidate(): Promise<void> {
    setValidating(true);
    setValidateResult(null);
    try {
      const r = await apiFetch('/api/auth/forward-auth/validate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          trustedProxies: cfg.trustedProxies,
          userHeader: cfg.userHeader,
        }),
      });
      if (r.status === 422) {
        const body = (await r.json()) as ValidateError;
        toast.error(`Invalid CIDR(s): ${body.invalidCidrs.join(', ')}`);
        return;
      }
      const body = (await r.json()) as ValidateResponse;
      setValidateResult(body);
      if (body.ready) {
        toast.success('Forward-auth is ready');
      } else {
        toast.warning('Forward-auth is not ready; see diagnostic');
      }
    } finally {
      setValidating(false);
    }
  }

  async function onSave(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    startTransition(async () => {
      const r = await apiFetch('/api/auth/forward-auth/config', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(cfg),
      });
      if (r.status === 422) {
        const body = (await r.json()) as ValidateResponse | ValidateError;
        if ('error' in body && body.error === 'invalid_cidr') {
          toast.error(`Invalid CIDR(s): ${(body as ValidateError).invalidCidrs.join(', ')}`);
        } else {
          toast.error(
            'Cannot enable forward-auth; your current request did not pass validation. Click "Validate connection" for details.',
          );
        }
        return;
      }
      if (!r.ok) {
        const j = (await r.json()) as { message: string };
        toast.error(j.message);
        return;
      }
      toast.success('Forward-auth settings saved');
      setSaved(cfg);
    });
  }

  const canEnable = validateResult?.ready === true || cfg.enabled;

  return (
    <SettingsSection
      name="Forward-auth (reverse-proxy SSO)"
      description="Accept identity headers (Remote-User, Remote-Email, Remote-Groups) injected by your reverse proxy when the request comes from a trusted source. Local username and password sign-in always remains available as a fallback."
    >
      <form onSubmit={onSave} className="space-y-4">
        <TagTokenInput
          id="trustedProxies"
          label="Trusted proxies"
          hint="CIDR list (IPv4 or IPv6). Press Enter or comma to add."
          value={cfg.trustedProxies}
          onChange={(next) => patch('trustedProxies', next)}
        />
        <div className="grid sm:grid-cols-3 gap-4">
          <Field label="User header" htmlFor="userHeader">
            <Input
              id="userHeader"
              value={cfg.userHeader}
              onChange={(e) => patch('userHeader', e.target.value)}
            />
          </Field>
          <Field label="Email header" htmlFor="emailHeader">
            <Input
              id="emailHeader"
              value={cfg.emailHeader}
              onChange={(e) => patch('emailHeader', e.target.value)}
            />
          </Field>
          <Field label="Groups header" htmlFor="groupsHeader">
            <Input
              id="groupsHeader"
              value={cfg.groupsHeader}
              onChange={(e) => patch('groupsHeader', e.target.value)}
            />
          </Field>
        </div>

        <div className="pt-2">
          <Button type="button" variant="outline" onClick={onValidate} disabled={validating}>
            {validating ? 'Validating…' : 'Validate connection'}
          </Button>
        </div>

        {validateResult !== null && (
          <div
            className={
              validateResult.ready
                ? 'rounded-md border border-[var(--color-ok)] bg-[var(--color-ok)]/10 p-3 text-xs space-y-1'
                : 'rounded-md border border-[var(--color-err)] bg-[var(--color-err)]/10 p-3 text-xs space-y-1'
            }
          >
            <div>
              <span className="text-muted-foreground">Peer IP detected:</span>{' '}
              <span className="font-mono">{validateResult.peerIp ?? '(none)'}</span>
              {validateResult.peerInTrustedProxies ? ' ✓ in CIDR list' : ' ✗ NOT in CIDR list'}
            </div>
            <div>
              <span className="text-muted-foreground">User header value:</span>{' '}
              <span className="font-mono">{validateResult.userHeaderValue ?? '(absent)'}</span>
            </div>
          </div>
        )}

        <label
          className={
            'flex items-center gap-2 text-sm ' + (canEnable ? '' : 'opacity-50 cursor-not-allowed')
          }
        >
          <Checkbox
            checked={cfg.enabled}
            onCheckedChange={(v) => patch('enabled', v === true)}
            disabled={!canEnable}
          />
          Enable forward-auth (requires successful validation)
        </label>

        <TagTokenInput
          id="allowedGroups"
          label="Allowed groups"
          hint="Empty = any forward-auth user with a valid header allowed."
          value={cfg.allowedGroups}
          onChange={(next) => patch('allowedGroups', next)}
        />
        <TagTokenInput
          id="adminGroups"
          label="Admin groups"
          hint="Members of these groups are admins on login."
          value={cfg.adminGroups}
          onChange={(next) => patch('adminGroups', next)}
        />

        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={cfg.autoCreateUsers}
            onCheckedChange={(v) => patch('autoCreateUsers', v === true)}
          />
          Auto-create users on first forward-auth login
        </label>

        <div className="pt-2 flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setCfg(saved)} disabled={pending}>
            Revert
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </form>
    </SettingsSection>
  );
}
