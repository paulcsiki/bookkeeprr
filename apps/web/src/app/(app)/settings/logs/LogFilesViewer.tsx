'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { VirtualList } from '@/components/ui/virtual-list';
import { apiFetch } from '@/lib/api-fetch';

type FileInfo = { name: string; sizeBytes: number; mtime: number };
type Tail = { lines: string[]; totalBytes: number; hasMore: boolean; nextBefore: number };

type Props = { initialFiles: FileInfo[] };

function fmtSize(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KiB`;
  return `${(b / 1024 / 1024).toFixed(1)} MiB`;
}

/** Compact mtime: "Jun 4, 1:56 PM" — drops the year + seconds so it fits one line. */
function fmtDate(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const FILE_ROW_PX = 52;

// Keys that carry no per-line signal once we've pulled out the columns below.
const LOG_NOISE_KEYS = new Set([
  'level',
  'time',
  'app',
  'component',
  'msg',
  'message',
  'pid',
  'hostname',
  'name',
  'v',
]);

type ParsedLog = {
  time: string;
  level: number;
  component: string | null;
  msg: string;
  extra: string;
};

/** pino numeric level → short label + token color class. */
function levelMeta(level: number): { label: string; cls: string } {
  if (level >= 60) return { label: 'FATL', cls: 'text-err' };
  if (level >= 50) return { label: 'ERR', cls: 'text-err' };
  if (level >= 40) return { label: 'WARN', cls: 'text-warn' };
  if (level >= 30) return { label: 'INFO', cls: 'text-info' };
  if (level >= 20) return { label: 'DBG', cls: 'text-muted-foreground' };
  return { label: 'TRCE', cls: 'text-muted-foreground/70' };
}

/** Parse a pino JSON log line into display columns; null for non-JSON lines. */
function parseLog(line: string): ParsedLog | null {
  try {
    const o = JSON.parse(line) as Record<string, unknown>;
    if (o === null || typeof o !== 'object') return null;
    const t = o.time;
    let time = '';
    if (t != null) {
      const d = new Date(t as string | number);
      if (!Number.isNaN(d.getTime())) time = d.toLocaleTimeString();
    }
    const extra = Object.entries(o)
      .filter(([k, v]) => !LOG_NOISE_KEYS.has(k) && v != null)
      .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
      .join(' ');
    return {
      time,
      level: typeof o.level === 'number' ? o.level : 30,
      component: typeof o.component === 'string' ? o.component : null,
      msg: typeof o.msg === 'string' ? o.msg : typeof o.message === 'string' ? o.message : '',
      extra,
    };
  } catch {
    return null;
  }
}

const LOG_ROW_PX = 24;

/** One log line — parsed into columns, kept to a single non-wrapping row. */
function LogRow({ line }: { line: string }): React.JSX.Element {
  const parsed = parseLog(line);
  if (parsed === null) {
    return (
      <div
        className="flex items-center overflow-hidden whitespace-nowrap text-foreground/70"
        style={{ height: LOG_ROW_PX }}
        title={line}
      >
        <span className="truncate">{line}</span>
      </div>
    );
  }
  const lvl = levelMeta(parsed.level);
  return (
    <div
      className="flex items-center gap-2 overflow-hidden whitespace-nowrap"
      style={{ height: LOG_ROW_PX }}
      title={line}
    >
      <span className="shrink-0 tabular-nums text-muted-foreground/60">{parsed.time}</span>
      <span className={`w-9 shrink-0 font-semibold ${lvl.cls}`}>{lvl.label}</span>
      {parsed.component ? (
        <span className="shrink-0 text-primary/70">{parsed.component}</span>
      ) : null}
      <span className="min-w-0 flex-1 truncate text-foreground/90">
        {parsed.msg}
        {parsed.extra ? <span className="ml-2 text-muted-foreground/70">{parsed.extra}</span> : null}
      </span>
    </div>
  );
}

/** How often a selected log is re-polled while live tailing. */
const TAIL_POLL_MS = 3000;

export function LogFilesViewer({ initialFiles }: Props): React.JSX.Element {
  const [files, setFiles] = useState<FileInfo[]>(initialFiles);
  const [selected, setSelected] = useState<string | null>(null);
  const [tail, setTail] = useState<Tail | null>(null);
  const [loading, setLoading] = useState(false);
  // Live "tail -f": auto-on when a file is opened, paused when the user browses
  // history (Load earlier) or toggles it off.
  const [tailing, setTailing] = useState(false);
  // Guards the one-time auto-open so a later user selection is never overridden.
  const autoSelectedRef = useRef(false);

  async function refresh(): Promise<void> {
    const r = await apiFetch('/api/audit/logs/files');
    const body = (await r.json()) as { files: FileInfo[] };
    setFiles(body.files);
  }

  async function load(name: string, before?: number): Promise<void> {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', '500');
      if (before !== undefined) params.set('before', String(before));
      const r = await apiFetch(`/api/audit/logs/files/${encodeURIComponent(name)}?${params}`);
      const body = (await r.json()) as Tail;
      setSelected(name);
      setTail((prev) =>
        prev !== null && before !== undefined
          ? { ...body, lines: [...body.lines, ...prev.lines] }
          : body,
      );
      // Opening a file (not paging earlier) starts live tailing; paging pauses it
      // so the loaded history isn't wiped by the next poll.
      setTailing(before === undefined);
    } finally {
      setLoading(false);
    }
  }

  // On first load, auto-open the most recent log (files are sorted newest-first,
  // so index 0 is newest). Runs once and only while nothing is selected yet, so
  // it never clobbers a selection the user makes later.
  useEffect(() => {
    if (autoSelectedRef.current || selected !== null) return;
    const newest = files[0];
    if (newest === undefined) return;
    autoSelectedRef.current = true;
    // Best-effort auto-open: a failed fetch must not surface as an unhandled
    // rejection (the user can still pick a file manually).
    void load(newest.name).catch(() => {});
  }, [files, selected]);

  // Live tail: while tailing, re-fetch the latest window every few seconds and
  // swap it in only when the file actually grew (totalBytes changed), so an
  // unchanged poll causes no re-render.
  useEffect(() => {
    if (selected === null || !tailing) return;
    let cancelled = false;
    const poll = async (): Promise<void> => {
      // Don't burn bandwidth/server reads while the tab is backgrounded.
      if (typeof document !== 'undefined' && document.hidden) return;
      try {
        const r = await apiFetch(
          `/api/audit/logs/files/${encodeURIComponent(selected)}?limit=500`,
        );
        if (!r.ok || cancelled) return;
        const body = (await r.json()) as Tail;
        if (cancelled) return;
        setTail((prev) => (prev && prev.totalBytes === body.totalBytes ? prev : body));
      } catch {
        // Transient read error — keep tailing; the next tick may succeed.
      }
    };
    const id = setInterval(() => void poll(), TAIL_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [selected, tailing]);

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 md:grid-cols-[16rem_1fr]">
      {/* Left pane: file list */}
      <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-elevated">
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            Files
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => void refresh()}>
            Refresh
          </Button>
        </div>

        {files.length === 0 ? (
          <div className="px-4 py-6 text-xs text-muted-foreground italic">No log files yet.</div>
        ) : (
          <VirtualList
            items={files}
            estimateSize={() => FILE_ROW_PX}
            keyExtractor={(f) => f.name}
            className="min-h-0 flex-1"
            renderItem={(f) => {
              const active = selected === f.name;
              return (
                <button
                  type="button"
                  style={{ height: FILE_ROW_PX }}
                  className={`relative flex w-full flex-col justify-center gap-0.5 border-t border-border px-4 text-left font-mono first:border-t-0 transition-colors ${
                    active
                      ? 'bg-[color-mix(in_oklab,var(--color-primary)_14%,transparent)] before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-primary before:content-[""]'
                      : 'hover:bg-hover'
                  }`}
                  onClick={() => void load(f.name)}
                  title={`${f.name} · ${new Date(f.mtime).toLocaleString()}`}
                >
                  <div className={`truncate text-xs ${active ? 'text-primary' : 'text-foreground/85'}`}>
                    {f.name}
                  </div>
                  <div className="truncate text-[10.5px] text-muted-foreground">
                    {fmtSize(f.sizeBytes)} · {fmtDate(f.mtime)}
                  </div>
                </button>
              );
            }}
          />
        )}
      </div>

      {/* Right pane: tail viewer */}
      <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-elevated">
        {selected === null ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">
            Select a file from the list.
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-border px-4 py-2">
              <div className="font-mono text-xs text-foreground/80">{selected}</div>
              <div className="flex items-center gap-2">
                {tail?.hasMore && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={loading}
                    // Paging into history pauses live tailing so it isn't wiped.
                    onClick={() => void load(selected, tail?.nextBefore)}
                  >
                    {loading ? 'Loading…' : 'Load earlier'}
                  </Button>
                )}
                <Button
                  type="button"
                  variant={tailing ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => (tailing ? setTailing(false) : void load(selected))}
                  disabled={loading}
                  title={tailing ? 'Live tailing — click to pause' : 'Resume live tailing'}
                >
                  <span
                    className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${
                      tailing ? 'animate-pulse bg-current' : 'bg-muted-foreground'
                    }`}
                    aria-hidden
                  />
                  {tailing ? 'Live' : 'Paused'}
                </Button>
              </div>
            </div>

            {(tail?.lines ?? []).length === 0 ? (
              <div className="px-4 py-6 text-xs text-muted-foreground italic">No lines loaded.</div>
            ) : (
              <VirtualList
                items={tail?.lines ?? []}
                estimateSize={() => LOG_ROW_PX}
                keyExtractor={(_line, idx) => idx}
                className="min-h-0 flex-1 p-3 font-mono text-xs"
                stickToBottom={tailing}
                renderItem={(line) => <LogRow line={line} />}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
