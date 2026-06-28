'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { VirtualList } from '@/components/ui/virtual-list';
import { RelativeTime } from '@/components/RelativeTime';
import { apiFetch } from '@/lib/api-fetch';
import type { AuditEventRow } from '@/server/db/audit';

type Props = {
  initialRows: AuditEventRow[];
  initialTotal: number;
};

// design-system .dtable: shared column grid; header + body styled separately.
// Trailing 2rem column holds the expand/collapse chevron.
const COLS = 'grid grid-cols-[13rem_8rem_16rem_12rem_1fr_2rem] gap-3';
const HEAD_ROW = `${COLS} items-center bg-elevated px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground`;
const BODY_ROW = `${COLS} items-center px-4 py-3 text-[13px] text-foreground/80`;

// Friendlier labels for the common metadata keys; others fall back to the key.
const META_LABELS: Record<string, string> = {
  changedFields: 'Changed',
  path: 'Path',
  reason: 'Reason',
};

/**
 * Parses the stored metadata JSON. Returns `{ obj }` for a plain object,
 * `{ text }` for any other shape (raw string, array, scalar), or `null` when
 * there's nothing to show.
 */
function parseMetadata(
  json: string | null,
): { obj: Record<string, unknown> } | { text: string } | null {
  if (json === null || json.length === 0) return null;
  try {
    const parsed = JSON.parse(json) as unknown;
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>;
      if (Object.entries(obj).filter(([, v]) => v != null).length === 0) return null;
      return { obj };
    }
    // Array / scalar — fall back to a compact JSON string.
    return { text: JSON.stringify(parsed) };
  } catch {
    // Not JSON — show the raw text.
    return { text: json };
  }
}

/** Formats a single metadata value for display (compact JSON for objects). */
function formatValue(v: unknown): string {
  return typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v);
}

/**
 * Compact, single-line metadata preview that fits the column. Plain objects
 * render as label · value chips (truncated); other shapes render as truncated
 * text. The full dump lives in the expansion panel.
 */
function MetadataPreview({ json }: { json: string | null }): React.JSX.Element {
  const parsed = parseMetadata(json);
  if (parsed === null) return <span className="text-muted-foreground">—</span>;
  if ('text' in parsed) {
    return (
      <span className="truncate font-mono text-[12px] text-muted-foreground" title={parsed.text}>
        {parsed.text}
      </span>
    );
  }
  const entries = Object.entries(parsed.obj).filter(([, v]) => v != null);
  return (
    <span className="flex min-w-0 items-center gap-x-3 overflow-hidden whitespace-nowrap">
      {entries.map(([k, v]) => (
        <span key={k} className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground/60">
            {META_LABELS[k] ?? k}
          </span>
          {Array.isArray(v) ? (
            v.map((item, i) => (
              <span
                key={i}
                className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground/80"
              >
                {String(item)}
              </span>
            ))
          ) : (
            <span className="truncate font-mono text-[12px] text-foreground/80">
              {formatValue(v)}
            </span>
          )}
        </span>
      ))}
    </span>
  );
}

/**
 * The expanded drawer: full metadata as a key → value property list. Object and
 * array values render as compact JSON. Scrolls past ~280px tall.
 */
function MetadataPanel({ json }: { json: string | null }): React.JSX.Element {
  const parsed = parseMetadata(json);
  if (parsed === null) {
    return <span className="font-mono text-[12px] text-muted-foreground">No metadata.</span>;
  }
  if ('text' in parsed) {
    return (
      <pre className="max-h-[280px] overflow-auto whitespace-pre-wrap break-all font-mono text-[12px] text-foreground/90">
        {parsed.text}
      </pre>
    );
  }
  const entries = Object.entries(parsed.obj);
  return (
    <dl className="max-h-[280px] overflow-auto">
      {entries.map(([k, v]) => (
        <div
          key={k}
          className="grid grid-cols-[10rem_1fr] gap-3 border-b border-border/40 py-1.5 last:border-b-0"
        >
          <dt className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            {META_LABELS[k] ?? k}
          </dt>
          <dd className="min-w-0 break-words font-mono text-[12px] text-foreground/90">
            {Array.isArray(v) ? (
              <span className="flex flex-wrap gap-1.5">
                {v.length === 0 ? (
                  <span className="text-muted-foreground">[]</span>
                ) : (
                  v.map((item, i) => (
                    <span
                      key={i}
                      className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-foreground/80"
                    >
                      {formatValue(item)}
                    </span>
                  ))
                )}
              </span>
            ) : (
              formatValue(v)
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function AuditEventsTable({ initialRows, initialTotal }: Props): React.JSX.Element {
  const [rows, setRows] = useState<AuditEventRow[]>(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [actionFilter, setActionFilter] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  async function load(opts: { action: string }): Promise<void> {
    const params = new URLSearchParams();
    params.set('limit', '10000');
    params.set('offset', '0');
    if (opts.action.length > 0) params.set('action', opts.action);
    const r = await apiFetch(`/api/audit/events?${params}`);
    const body = (await r.json()) as { rows: AuditEventRow[]; total: number };
    setRows(body.rows);
    setTotal(body.total);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-2">
        <Field label="Action filter" htmlFor="action-filter" className="flex-1">
          <Input
            id="action-filter"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            placeholder="e.g. auth.login_success"
          />
        </Field>
        <Button type="button" onClick={() => void load({ action: actionFilter })} variant="outline">
          Apply
        </Button>
      </div>

      <div className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
        Showing {rows.length} of {total} events
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-elevated">
        <div className={HEAD_ROW}>
          <span>Time</span>
          <span>Actor</span>
          <span>Action</span>
          <span>Target</span>
          <span>Metadata</span>
          <span className="sr-only">Expand</span>
        </div>

        {rows.length === 0 ? (
          <div className="border-t border-border px-4 py-6 text-sm text-muted-foreground">
            No audit events found.
          </div>
        ) : (
          <VirtualList
            items={rows}
            estimateSize={() => 49}
            keyExtractor={(r) => r.id}
            className="h-[600px]"
            dynamicHeight
            renderItem={(r) => {
              const expanded = expandedId === r.id;
              return (
                <div className="border-t border-border">
                  <div
                    className={`${BODY_ROW} min-h-[48px] ${expanded ? 'bg-hover' : 'hover:bg-hover'}`}
                  >
                    <span className="font-mono text-muted-foreground">
                      <RelativeTime date={r.timestamp} />
                    </span>
                    <span>
                      {r.actorKind === 'user'
                        ? (r.actorUsername ?? `user#${r.actorUserId}`)
                        : `(${r.actorKind})`}
                    </span>
                    <span className="font-mono">{r.action}</span>
                    <span className="font-mono text-muted-foreground">
                      {r.targetKind !== null ? `${r.targetKind}:${r.targetId}` : '—'}
                    </span>
                    <MetadataPreview json={r.metadataJson} />
                    <button
                      type="button"
                      aria-expanded={expanded}
                      aria-label={expanded ? 'Collapse details' : 'Expand details'}
                      onClick={() => setExpandedId((cur) => (cur === r.id ? null : r.id))}
                      className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <ChevronDown
                        className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
                      />
                    </button>
                  </div>
                  {expanded ? (
                    <div className="border-t border-border bg-muted/40 px-4 py-3">
                      <MetadataPanel json={r.metadataJson} />
                    </div>
                  ) : null}
                </div>
              );
            }}
          />
        )}
      </div>
    </div>
  );
}
