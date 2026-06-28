'use client';

import { useEffect, useRef, useState } from 'react';
import { Copy, Trash2, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiFetch } from '@/lib/api-fetch';

type ApiKey = {
  id: number;
  name: string;
  keyPrefix: string;
  createdAt: string | number;
  lastUsedAt: string | number | null;
};

type GeneratedKey = {
  id: number;
  name: string;
  keyPrefix: string;
  plaintext: string;
};

function formatDate(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return 'Never';
  const d = new Date(val);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function ApiKeysSection(): React.JSX.Element {
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dialog state
  const [showDialog, setShowDialog] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [generated, setGenerated] = useState<GeneratedKey | null>(null);
  const [copied, setCopied] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    apiFetch('/api/auth/me/api-keys')
      .then((r) => r.json() as Promise<{ keys: ApiKey[] }>)
      .then((j) => setKeys(j.keys))
      .catch(() => setError('Could not load API keys'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (showDialog && !generated) {
      setTimeout(() => nameInputRef.current?.focus(), 50);
    }
  }, [showDialog, generated]);

  async function handleGenerate(): Promise<void> {
    if (!newKeyName.trim()) {
      setGenError('Name is required');
      return;
    }
    setGenerating(true);
    setGenError(null);
    try {
      const r = await apiFetch('/api/auth/me/api-keys', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: newKeyName.trim() }),
      });
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { message?: string };
        setGenError(body.message ?? `Failed (${r.status})`);
        return;
      }
      const key = (await r.json()) as GeneratedKey;
      setGenerated(key);
      setKeys((prev) =>
        prev
          ? [
              {
                id: key.id,
                name: key.name,
                keyPrefix: key.keyPrefix,
                createdAt: Date.now(),
                lastUsedAt: null,
              },
              ...prev,
            ]
          : null,
      );
    } catch {
      setGenError('Generation failed. Please try again.');
    } finally {
      setGenerating(false);
    }
  }

  async function handleRevoke(id: number): Promise<void> {
    try {
      const r = await apiFetch(`/api/auth/me/api-keys/${id}`, { method: 'DELETE' });
      if (!r.ok) return;
      setKeys((prev) => prev?.filter((k) => k.id !== id) ?? null);
    } catch {
      // silent
    }
  }

  function handleCopy(text: string): void {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleCloseDialog(): void {
    setShowDialog(false);
    setNewKeyName('');
    setGenError(null);
    setGenerated(null);
    setCopied(false);
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button size="sm" onClick={() => setShowDialog(true)}>
          Generate new key
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : error ? (
        <p className="text-sm text-[var(--color-err)]">{error}</p>
      ) : !keys || keys.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <KeyRound className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No API keys yet.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Name</th>
                <th className="px-4 py-2.5 text-left font-mono font-medium text-muted-foreground">Key</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Created</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Last used</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {keys.map((k) => (
                <tr key={k.id} className="hover:bg-muted/20">
                  <td className="px-4 py-3 text-foreground">{k.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    bkr_{k.keyPrefix}…
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(k.createdAt)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(k.lastUsedAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      aria-label={`Revoke key ${k.name}`}
                      onClick={() => void handleRevoke(k.id)}
                      className="rounded p-1.5 text-muted-foreground hover:bg-[var(--color-err)]/10 hover:text-[var(--color-err)]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Generate key dialog */}
      {showDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={handleCloseDialog}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-border p-5">
              <h3 className="font-display text-base font-semibold text-foreground">
                {generated ? 'Your new API key' : 'Generate API key'}
              </h3>
            </div>

            <div className="p-5">
              {generated ? (
                <div className="space-y-4">
                  <p className="text-sm text-[var(--color-warn)]">
                    Copy this key now — it will not be shown again.
                  </p>
                  <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 p-3">
                    <code className="flex-1 break-all font-mono text-xs text-foreground">
                      {generated.plaintext}
                    </code>
                    <button
                      type="button"
                      aria-label="Copy key"
                      onClick={() => handleCopy(generated.plaintext)}
                      className="shrink-0 rounded p-1.5 hover:bg-muted"
                    >
                      <Copy className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </div>
                  {copied && (
                    <p className="text-xs text-primary">Copied to clipboard!</p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground" htmlFor="api-key-name">
                      Key name
                    </label>
                    <Input
                      ref={nameInputRef}
                      id="api-key-name"
                      placeholder="e.g. Home scripts"
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') void handleGenerate(); }}
                      disabled={generating}
                    />
                  </div>
                  {genError && (
                    <p className="text-xs text-[var(--color-err)]">{genError}</p>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
              <Button variant="outline" onClick={handleCloseDialog}>
                {generated ? 'Done' : 'Cancel'}
              </Button>
              {!generated && (
                <Button onClick={() => void handleGenerate()} disabled={generating}>
                  {generating ? 'Generating…' : 'Generate'}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
