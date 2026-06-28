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

export type OidcFormConfig = {
  enabled: boolean;
  issuer: string;
  clientId: string;
  clientSecret: string;
  scopes: string[];
  buttonLabel: string;
  usernameClaim: string;
  emailClaim: string;
  groupsClaim: string;
  allowedGroups: string[];
  adminGroups: string[];
  autoCreateUsers: boolean;
};

type Props = { initial: OidcFormConfig };

const MASK = '••••••••';

export function OidcForm({ initial }: Props): React.JSX.Element {
  // Saved baseline; re-set on a successful save so the form is clean afterwards.
  const [saved, setSaved] = useState<OidcFormConfig>(initial);
  const [cfg, setCfg] = useState<OidcFormConfig>(initial);
  const [secretInput, setSecretInput] = useState('');
  const [pending, startTransition] = useTransition();
  const [testing, setTesting] = useState(false);

  const dirty = JSON.stringify(cfg) !== JSON.stringify(saved) || secretInput.length > 0;
  useUnsavedChanges(dirty);

  function patch<K extends keyof OidcFormConfig>(key: K, value: OidcFormConfig[K]): void {
    setCfg((c) => ({ ...c, [key]: value }));
  }

  async function onSave(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    startTransition(async () => {
      const body: Partial<OidcFormConfig> = { ...cfg };
      body.clientSecret = secretInput;
      const r = await apiFetch('/api/auth/oidc/config', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const j = (await r.json()) as { message: string };
        toast.error(j.message);
        return;
      }
      toast.success('OIDC settings saved');
      // Re-baseline so the form is clean again. If a new secret was entered it is
      // now stored, so the masked sentinel reflects "a secret exists".
      const nextCfg: OidcFormConfig = {
        ...cfg,
        clientSecret: secretInput.length > 0 ? MASK : cfg.clientSecret,
      };
      setCfg(nextCfg);
      setSaved(nextCfg);
      setSecretInput('');
    });
  }

  async function onTest(): Promise<void> {
    if (cfg.issuer.length === 0 || cfg.clientId.length === 0) {
      toast.error('Set Issuer URL and Client ID first');
      return;
    }
    setTesting(true);
    try {
      const r = await apiFetch('/api/auth/oidc/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          issuer: cfg.issuer,
          clientId: cfg.clientId,
          clientSecret: secretInput.length > 0 ? secretInput : MASK,
        }),
      });
      const body = (await r.json()) as { ok: boolean; error?: string; issuer?: string };
      if (body.ok) {
        toast.success(`Discovery OK — issuer: ${body.issuer}`);
      } else {
        toast.error(`Discovery failed: ${body.error ?? 'unknown'}`);
      }
    } finally {
      setTesting(false);
    }
  }

  return (
    <form onSubmit={onSave} className="space-y-7">
      {/* Wrap sections so the last visible one drops its bottom border (the
          sticky save bar below already provides the divider). */}
      <div className="space-y-7">
      <SettingsSection
        name="Sign-in methods"
        description="Local username and password sign-in is always available, even when single sign-on is configured."
      >
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={cfg.enabled} onCheckedChange={(v) => patch('enabled', v === true)} />
          OpenID Connect (OIDC)
        </label>
      </SettingsSection>

      {cfg.enabled && (
        <SettingsSection
          name="OIDC provider"
          description="Configure discovery, client credentials, and claim mapping for your OIDC identity provider."
        >
          <div className="space-y-4">
            <Field label="Issuer URL" htmlFor="issuer" required>
              <Input
                id="issuer"
                value={cfg.issuer}
                onChange={(e) => patch('issuer', e.target.value)}
                placeholder="https://auth.example.com/application/o/bookkeeprr/"
              />
            </Field>
            <Field label="Client ID" htmlFor="clientId" required>
              <Input
                id="clientId"
                value={cfg.clientId}
                onChange={(e) => patch('clientId', e.target.value)}
              />
            </Field>
            <Field
              label="Client Secret"
              htmlFor="clientSecret"
              hint={
                cfg.clientSecret === MASK ? 'Leave blank to keep the existing secret.' : undefined
              }
            >
              <Input
                id="clientSecret"
                type="password"
                value={secretInput}
                onChange={(e) => setSecretInput(e.target.value)}
                placeholder={cfg.clientSecret === MASK ? MASK : ''}
              />
            </Field>
            <TagTokenInput
              id="scopes"
              label="Scopes"
              value={cfg.scopes}
              onChange={(next) => patch('scopes', next)}
            />
            <Field label="Button label" htmlFor="buttonLabel">
              <Input
                id="buttonLabel"
                value={cfg.buttonLabel}
                onChange={(e) => patch('buttonLabel', e.target.value)}
              />
            </Field>
            <div className="grid sm:grid-cols-3 gap-4">
              <Field label="Username claim" htmlFor="usernameClaim">
                <Input
                  id="usernameClaim"
                  value={cfg.usernameClaim}
                  onChange={(e) => patch('usernameClaim', e.target.value)}
                />
              </Field>
              <Field label="Email claim" htmlFor="emailClaim">
                <Input
                  id="emailClaim"
                  value={cfg.emailClaim}
                  onChange={(e) => patch('emailClaim', e.target.value)}
                />
              </Field>
              <Field label="Groups claim" htmlFor="groupsClaim">
                <Input
                  id="groupsClaim"
                  value={cfg.groupsClaim}
                  onChange={(e) => patch('groupsClaim', e.target.value)}
                />
              </Field>
            </div>
            <TagTokenInput
              id="allowedGroups"
              label="Allowed groups"
              hint="Empty = any successful OIDC token allowed."
              value={cfg.allowedGroups}
              onChange={(next) => patch('allowedGroups', next)}
            />
            <TagTokenInput
              id="adminGroups"
              label="Admin groups"
              hint="Members of these groups become admins on login."
              value={cfg.adminGroups}
              onChange={(next) => patch('adminGroups', next)}
            />
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={cfg.autoCreateUsers}
                onCheckedChange={(v) => patch('autoCreateUsers', v === true)}
              />
              Auto-create users on first OIDC login
            </label>
            <div className="pt-2">
              <Button type="button" variant="outline" onClick={onTest} disabled={testing}>
                {testing ? 'Testing…' : 'Test connection'}
              </Button>
            </div>
          </div>
        </SettingsSection>
      )}
      </div>

      <div className="sticky bottom-0 -mx-4 px-4 py-3 bg-background/95 backdrop-blur border-t border-border">
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setCfg(saved);
              setSecretInput('');
            }}
            disabled={pending}
          >
            Revert
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </form>
  );
}
