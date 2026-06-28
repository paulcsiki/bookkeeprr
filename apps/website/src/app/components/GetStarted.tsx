'use client';

import { useState } from 'react';
import { APP_VERSION } from '../../lib/version';

const COMPOSE_YAML = `services:
  bookkeeprr:
    image: ghcr.io/paulcsiki/bookkeeprr:${APP_VERSION}
    container_name: bookkeeprr
    restart: unless-stopped
    ports:
      - "8484:8484"             # front behind your own TLS proxy
    environment:
      BOOKKEEPRR_BASE_URL: http://bookkeeprr.local:8484
      TZ: Europe/Stockholm
      # Authentication: forms, OIDC, proxy. Configured at runtime
      # under Settings → Authentication. No secrets in compose.
    volumes:
      - ./config:/config            # database + logs
      - /srv/media:/media           # your library root
    healthcheck:
      test: ["CMD", "curl", "-fs", "http://localhost:8484/health"]
      interval: 30s`;

type StepKey = 'install' | 'indexers' | 'qbit' | 'monitor';

const STEPS: ReadonlyArray<{ key: StepKey; num: string; name: string; body: string }> = [
  {
    key: 'install',
    num: '01 · install',
    name: 'Spin up the container.',
    body: 'Docker compose. Mount two volumes. Pin the version tag.',
  },
  {
    key: 'indexers',
    num: '02 · indexers',
    name: 'Wire up your indexers.',
    body: "Paste credentials from Prowlarr or whatever you're already running.",
  },
  {
    key: 'qbit',
    num: '03 · download',
    name: 'Point at qBittorrent.',
    body: 'Host, port, category. Test the connection, save.',
  },
  {
    key: 'monitor',
    num: '04 · monitor',
    name: 'Add your first series.',
    body: 'Add new → search → pick a quality profile → bookkeeprr does the rest.',
  },
];

const TrafficDots = (): React.JSX.Element => (
  <span className="traffic">
    <span style={{ background: 'var(--err)' }} />
    <span style={{ background: 'var(--warn)' }} />
    <span style={{ background: 'var(--ok)' }} />
  </span>
);

export function GetStarted(): React.JSX.Element {
  const [active, setActive] = useState<StepKey>('install');
  const [copied, setCopied] = useState(false);

  function handleCopy(): void {
    void navigator.clipboard.writeText(COMPOSE_YAML);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <section className="section" id="start">
      <div className="wrap">
        <div className="section-head">
          <div>
            <span className="eyebrow">get started</span>
            <h2 className="section-title">Up in three commands.</h2>
          </div>
          <p className="section-lede">
            Bookkeeprr ships as a single Docker image. Drop the compose file below into your stack,
            mount a volume for the database and a volume for your media root, you&apos;re done.
          </p>
        </div>

        <div className="start-grid">
          <div className="start-steps">
            {STEPS.map((s) => (
              <div
                key={s.key}
                className={`start-step${active === s.key ? ' active' : ''}`}
                onClick={() => setActive(s.key)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setActive(s.key);
                  }
                }}
              >
                <span className="num">{s.num}</span>
                <div className="name">{s.name}</div>
                <div className="body">{s.body}</div>
              </div>
            ))}
          </div>

          <div className="start-panel-wrap">
            {/* ── STEP 1 · INSTALL ── */}
            <div className={`start-panel${active === 'install' ? ' is-active' : ''}`}>
              <div className="head">
                <span className="file">
                  <TrafficDots />
                  docker-compose.yml
                </span>
                <button
                  className={`copy${copied ? ' copied' : ''}`}
                  onClick={handleCopy}
                  type="button"
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <pre className="code">
                <span className="k">services</span>:{'\n'}
                {'  '}
                <span className="k">bookkeeprr</span>:{'\n'}
                {'    '}
                <span className="k">image</span>:{' '}
                <span className="s">ghcr.io/paulcsiki/bookkeeprr:{APP_VERSION}</span>
                {'\n'}
                {'    '}
                <span className="k">container_name</span>: <span className="v">bookkeeprr</span>
                {'\n'}
                {'    '}
                <span className="k">restart</span>: <span className="v">unless-stopped</span>
                {'\n'}
                {'    '}
                <span className="k">ports</span>:{'\n'}
                <span style={{ display: 'inline-block', minWidth: '34ch' }}>
                  {'      '}- <span className="s">&quot;8484:8484&quot;</span>
                </span>
                <span className="c"># front behind your own TLS proxy</span>
                {'\n'}
                {'    '}
                <span className="k">environment</span>:{'\n'}
                {'      '}
                <span className="k">BOOKKEEPRR_BASE_URL</span>:{' '}
                <span className="s">http://bookkeeprr.local:8484</span>
                {'\n'}
                {'      '}
                <span className="k">TZ</span>: <span className="s">Europe/Stockholm</span>
                {'\n'}
                {'      '}
                <span className="c">
                  # Authentication: forms, OIDC, proxy. Configured at runtime
                </span>
                {'\n'}
                {'      '}
                <span className="c"># under Settings → Authentication. No secrets in compose.</span>
                {'\n'}
                {'    '}
                <span className="k">volumes</span>:{'\n'}
                <span style={{ display: 'inline-block', minWidth: '34ch' }}>
                  {'      '}- <span className="s">./config:/config</span>
                </span>
                <span className="c"># database + logs</span>
                {'\n'}
                <span style={{ display: 'inline-block', minWidth: '34ch' }}>
                  {'      '}- <span className="s">/srv/media:/media</span>
                </span>
                <span className="c"># your library root</span>
                {'\n'}
                {'    '}
                <span className="k">healthcheck</span>:{'\n'}
                {'      '}
                <span className="k">test</span>: [<span className="s">&quot;CMD&quot;</span>,{' '}
                <span className="s">&quot;curl&quot;</span>,{' '}
                <span className="s">&quot;-fs&quot;</span>,{' '}
                <span className="s">&quot;http://localhost:8484/health&quot;</span>]{'\n'}
                {'      '}
                <span className="k">interval</span>: <span className="n">30s</span>
              </pre>
            </div>

            {/* ── STEP 2 · INDEXERS ── */}
            <div className={`start-panel${active === 'indexers' ? ' is-active' : ''}`}>
              <div className="head">
                <span className="file">
                  <TrafficDots />
                  Settings → Indexers
                </span>
                <span className="head-pill">4 connected</span>
              </div>
              <div className="step-body">
                <IndexerRow
                  logoColor="#9bb6ff"
                  icon="globe"
                  name="Nyaa"
                  state="ok"
                  stateLabel="live"
                  meta={
                    <>
                      RSS · 4 categories ·{' '}
                      <span className="mono" style={{ color: 'var(--fg-soft)' }}>
                        cat: 5,7,11,13
                      </span>
                    </>
                  }
                />
                <IndexerRow
                  logoColor="var(--t-novel)"
                  icon="book"
                  name="MangaDex"
                  state="warn"
                  stateLabel="slow"
                  meta={
                    <>
                      REST · auth ok ·{' '}
                      <span className="mono" style={{ color: 'var(--fg-soft)' }}>
                        last sync 14m ago
                      </span>
                    </>
                  }
                />
                <IndexerRow
                  logoColor="var(--t-manga)"
                  icon="card"
                  name="AnimeBytes"
                  state="ok"
                  stateLabel="live"
                  meta={
                    <>
                      Private · API key ·{' '}
                      <span className="mono" style={{ color: 'var(--fg-soft)' }}>
                        12 grabs · 24h
                      </span>
                    </>
                  }
                />
                <IndexerRow
                  logoColor="var(--primary)"
                  icon="grid"
                  name="Prowlarr"
                  state="ok"
                  stateLabel="12 indexers"
                  meta={
                    <>
                      Proxy ·{' '}
                      <span className="mono" style={{ color: 'var(--fg-soft)' }}>
                        prowlarr.local:9696
                      </span>
                    </>
                  }
                />
              </div>
              <div className="step-foot">
                <span className="step-foot-meta">
                  All four pass{' '}
                  <span className="mono" style={{ color: 'var(--ok)' }}>
                    200 / auth ok
                  </span>
                </span>
                <span className="step-foot-cta">Add indexer ↗</span>
              </div>
            </div>

            {/* ── STEP 3 · DOWNLOAD (qBittorrent) ── */}
            <div className={`start-panel${active === 'qbit' ? ' is-active' : ''}`}>
              <div className="head">
                <span className="file">
                  <TrafficDots />
                  Settings → Download clients → qBittorrent
                </span>
                <span className="head-pill ok">tested · 92ms</span>
              </div>
              <div className="step-body qbit-body">
                <div className="qb-grid">
                  <QbField label="Host" value="qbittorrent.local" mono />
                  <QbField label="Port" value="8080" mono />
                  <QbField label="Username" value="admin" />
                  <QbField label="Password" value="••••••••••••" mono />
                  <QbField
                    span
                    label="Category"
                    opt="applied as label on every grab"
                    value="bookkeeprr"
                    mono
                  />
                  <QbField
                    span
                    label="Save path"
                    opt="remote — qBittorrent perspective"
                    value="/downloads/incoming"
                    mono
                  />
                </div>
                <div className="qb-toggles">
                  <QbCheck on label="Use SSL" />
                  <QbCheck on label="Add paused" />
                  <QbCheck label="First & last piece priority" />
                  <QbCheck on label="Remove completed" />
                </div>
              </div>
              <div className="step-foot">
                <span className="step-foot-meta">
                  v5.0.1 ·{' '}
                  <span className="mono" style={{ color: 'var(--ok)' }}>
                    connected
                  </span>{' '}
                  · 38 active torrents
                </span>
                <span className="step-foot-cta">Test &amp; save</span>
              </div>
            </div>

            {/* ── STEP 4 · MONITOR ── */}
            <div className={`start-panel${active === 'monitor' ? ' is-active' : ''}`}>
              <div className="head">
                <span className="file">
                  <TrafficDots />
                  Library → Add series
                </span>
                <span className="head-pill">5 results · 412ms</span>
              </div>
              <div className="step-body monitor-body">
                <div className="mon-search">
                  <svg
                    viewBox="0 0 24 24"
                    width="14"
                    height="14"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ color: 'var(--primary)' }}
                  >
                    <circle cx="11" cy="11" r="7" />
                    <path d="m20 20-3.5-3.5" />
                  </svg>
                  <span className="mon-q">vinland saga</span>
                  <span className="mon-meta">anilist + mdex</span>
                </div>
                <MonResult
                  hue={12}
                  isbn="9781612624204"
                  title="Vinland Saga"
                  byline="Makoto Yukimura · 2005 — ongoing · 27 volumes"
                  pills={[
                    { kind: 'manga', label: 'Manga' },
                    { kind: 'primary', label: 'Monitored' },
                  ]}
                  added
                />
                <MonResult
                  hue={220}
                  isbn="9780316315302"
                  title="Vinland Saga — Light Novel"
                  byline="Shigeru Nishiyama · 2008 · 3 volumes"
                  pills={[{ kind: 'novel', label: 'Light Novel' }]}
                />
                <MonResult
                  hue={340}
                  isbn="9780765382030"
                  title="Vinland Saga · Audio Drama"
                  byline="Audible Original · 2022 · 12 hrs"
                  pills={[{ kind: 'audio', label: 'Audiobook' }]}
                />
              </div>
              <div className="step-foot">
                <span className="step-foot-meta">↑↓ navigate · ⏎ add · esc close</span>
                <span className="step-foot-cta">Add &amp; configure ↗</span>
              </div>
            </div>
          </div>
        </div>

        {/* Info cards aligned under the panel column (empty spacer matches the
            steps column, then a 3-up card grid in the panel's 1fr region). */}
        <div className="start-cards">
          <div />
          <div className="start-card-grid">
            <div className="start-card">
              <div className="lbl">REQUIREMENTS</div>
              <div className="txt">
                Docker 24+, 512 MiB RAM, 2 GiB disk for the app. Library storage on you.
              </div>
            </div>
            <div className="start-card">
              <div className="lbl">FIRST RUN</div>
              <div className="txt">
                Visit{' '}
                <span className="mono" style={{ color: 'var(--fg)' }}>
                  :8484
                </span>
                , sign in, follow the onboarding wizard. Five minutes.
              </div>
            </div>
            <div className="start-card">
              <div className="lbl">UPGRADES</div>
              <div className="txt">
                Bump the image tag,{' '}
                <span className="mono" style={{ color: 'var(--fg)' }}>
                  docker compose pull &amp;&amp; up -d
                </span>
                . Bookkeeprr migrates the database itself.
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

type IcoName = 'globe' | 'book' | 'card' | 'grid';
function IndexerRow({
  logoColor,
  icon,
  name,
  state,
  stateLabel,
  meta,
}: {
  logoColor: string;
  icon: IcoName;
  name: string;
  state: 'ok' | 'warn';
  stateLabel: string;
  meta: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="sp-row">
      <div className="sp-logo" style={{ color: logoColor }}>
        <IndexerIcon name={icon} />
      </div>
      <div className="sp-info">
        <div className="sp-name">
          {name} <span className={`sp-state ${state}`}>{stateLabel}</span>
        </div>
        <div className="sp-meta">{meta}</div>
      </div>
      <span className="sp-switch on" />
    </div>
  );
}

function IndexerIcon({ name }: { name: IcoName }): React.JSX.Element {
  const c = {
    viewBox: '0 0 24 24',
    width: 20,
    height: 20,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (name) {
    case 'globe':
      return (
        <svg {...c}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
        </svg>
      );
    case 'book':
      return (
        <svg {...c}>
          <path d="M4 4h12a4 4 0 0 1 4 4v12H8a4 4 0 0 1-4-4z" />
          <path d="M4 16a4 4 0 0 1 4-4h12" />
        </svg>
      );
    case 'card':
      return (
        <svg {...c}>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M3 9h18M9 14h6" />
        </svg>
      );
    case 'grid':
      return (
        <svg {...c}>
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
        </svg>
      );
  }
}

function QbField({
  label,
  opt,
  value,
  mono = false,
  span = false,
}: {
  label: string;
  opt?: string;
  value: string;
  mono?: boolean;
  span?: boolean;
}): React.JSX.Element {
  return (
    <div className={`qb-field${span ? ' qb-span' : ''}`}>
      <span className="qb-label">
        {label}
        {opt && <span className="qb-opt">{opt}</span>}
      </span>
      <span className={`qb-input${mono ? ' mono' : ''}`}>{value}</span>
    </div>
  );
}

function QbCheck({ label, on = false }: { label: string; on?: boolean }): React.JSX.Element {
  return (
    <label className="qb-check">
      <span className={`qb-cb${on ? ' on' : ''}`} />
      <span>{label}</span>
    </label>
  );
}

type MonPillKind = 'manga' | 'novel' | 'audio' | 'primary';
function MonResult({
  hue,
  isbn,
  title,
  byline,
  pills,
  added = false,
}: {
  hue: number;
  isbn: string;
  title: string;
  byline: string;
  pills: ReadonlyArray<{ kind: MonPillKind; label: string }>;
  added?: boolean;
}): React.JSX.Element {
  return (
    <div className="mon-result">
      <div
        className="mon-cv"
        style={{ background: `linear-gradient(160deg, hsl(${hue} 35% 22%), hsl(${hue} 30% 12%))` }}
      >
        { }
        <img src={`/img/cover-${isbn}.jpg`} alt="" loading="eager" />
      </div>
      <div className="mon-info">
        <div className="mon-ttl">{title}</div>
        <div className="mon-bl">{byline}</div>
        <div className="mon-pills">
          {pills.map((p) => (
            <span key={p.label} className={`mon-pill ${p.kind}`}>
              {p.label}
            </span>
          ))}
        </div>
      </div>
      <button type="button" className={`mon-add${added ? ' primary' : ''}`}>
        {added ? 'Added ✓' : 'Add'}
      </button>
    </div>
  );
}
