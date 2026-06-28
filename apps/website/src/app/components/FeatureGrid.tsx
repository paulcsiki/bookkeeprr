import { ThemeSwatchPicker } from './ThemeSwatchPicker';

type CalType = 'manga' | 'novel' | 'comic' | 'ebook' | 'audio';
type CalRelease = { t: string; sub: string; k: CalType; isbn: string; hue: number };

// May 2026 — Fri May 1 = 5 leading empties. Data mirrors the new design's
// calendar preview release set; all ISBNs are cached under /img/cover-*.jpg.
const CAL_FIRST_DOW = 5;
const CAL_DAYS_IN_MONTH = 31;
const CAL_TODAY = 14;
const CAL_TOTAL_LABEL = '12 releases this month';
const CAL_RELEASES: Record<number, CalRelease[]> = {
  4: [
    { k: 'manga', t: 'Berserk · v43', sub: 'Kentaro Miura', isbn: '9781506711980', hue: 340 },
    {
      k: 'novel',
      t: 'Spice and Wolf · v25',
      sub: 'Isuna Hasekura',
      isbn: '9780759531048',
      hue: 30,
    },
  ],
  9: [
    { k: 'comic', t: 'Saga · issue 67', sub: 'Brian K. Vaughan', isbn: '9781607066019', hue: 60 },
  ],
  14: [
    { k: 'manga', t: 'Vinland Saga · v28', sub: 'Makoto Yukimura', isbn: '9781612624204', hue: 12 },
    { k: 'manga', t: 'Chainsaw Man · v17', sub: 'Tatsuki Fujimoto', isbn: '9781974709939', hue: 0 },
    {
      k: 'ebook',
      t: 'Piranesi · annotated',
      sub: 'Susanna Clarke',
      isbn: '9781635575637',
      hue: 200,
    },
  ],
  18: [
    { k: 'novel', t: 'Re:Zero · v35', sub: 'Tappei Nagatsuki', isbn: '9780316315302', hue: 220 },
  ],
  21: [
    {
      k: 'manga',
      t: 'Witch Hat Atelier · v14',
      sub: 'Kamome Shirahama',
      isbn: '9781632367709',
      hue: 250,
    },
    { k: 'ebook', t: 'Project Hail Mary · pb', sub: 'Andy Weir', isbn: '9780593135204', hue: 150 },
    { k: 'manga', t: 'Tokyo Ghoul · re v15', sub: 'Sui Ishida', isbn: '9781421580364', hue: 280 },
    { k: 'novel', t: 'Mistborn · final', sub: 'Brandon Sanderson', isbn: '9780316315302', hue: 35 },
    { k: 'comic', t: 'Monstress · issue 52', sub: 'Marjorie Liu', isbn: '9781632157096', hue: 280 },
  ],
  27: [{ k: 'audio', t: 'Three-Body · vol 2', sub: 'Liu Cixin', isbn: '9780765382030', hue: 300 }],
  30: [
    {
      k: 'comic',
      t: 'Monstress · 52 reprint',
      sub: 'Marjorie Liu',
      isbn: '9781632157096',
      hue: 280,
    },
    { k: 'manga', t: 'Tokyo Ghoul · re v17', sub: 'Sui Ishida', isbn: '9781421580364', hue: 280 },
  ],
};

/** Calendar V2 — full month grid with event-text rows in cells, today
 *  highlighted with a full-cell primary-soft tint, popovers carry the
 *  cover art (cells stay textual). Matches the design system's cal-page. */
function CalendarPreview(): React.JSX.Element {
  const cells: Array<{ day: number | null }> = [];
  for (let i = 0; i < CAL_FIRST_DOW; i++) cells.push({ day: null });
  for (let d = 1; d <= CAL_DAYS_IN_MONTH; d++) cells.push({ day: d });
  while (cells.length % 7 !== 0) cells.push({ day: null });

  return (
    <div className="cal-page">
      <div className="cal-page-head">
        <div className="month">May 2026</div>
        <div className="controls">
          <button
            type="button"
            className="cal-btn cal-btn-sq"
            aria-label="Previous month"
            disabled
            aria-disabled="true"
            tabIndex={-1}
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <button type="button" className="cal-btn" disabled aria-disabled="true" tabIndex={-1}>
            Today
          </button>
          <button
            type="button"
            className="cal-btn cal-btn-sq"
            aria-label="Next month"
            disabled
            aria-disabled="true"
            tabIndex={-1}
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
          <span className="cal-count">{CAL_TOTAL_LABEL}</span>
          <button type="button" className="cal-btn" disabled aria-disabled="true" tabIndex={-1}>
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" />
            </svg>
            ICS export
          </button>
        </div>
      </div>
      <div className="cal-dow-bar">
        <span>Sun</span>
        <span>Mon</span>
        <span>Tue</span>
        <span>Wed</span>
        <span>Thu</span>
        <span>Fri</span>
        <span>Sat</span>
      </div>
      <div className="cal-month-grid">
        {cells.map((c, i) => {
          if (c.day == null) {
            return <div key={`empty-${i}`} className="cal-cell empty" aria-hidden />;
          }
          const releases = CAL_RELEASES[c.day];
          const isToday = c.day === CAL_TODAY;
          const rowIdx = Math.floor(i / 7);
          const popBelow = rowIdx < 2;
          if (!releases || releases.length === 0) {
            return (
              <div key={c.day} className={`cal-cell${isToday ? ' today' : ''}`}>
                <span className="n">{isToday ? `${c.day} · today` : c.day}</span>
              </div>
            );
          }
          const inlineCount = Math.min(releases.length, 2);
          const moreCount = releases.length - inlineCount;
          const cls = ['cal-cell', 'has'];
          if (isToday) cls.push('today');
          if (popBelow) cls.push('pop-below');
          return (
            <div key={c.day} className={cls.join(' ')}>
              <span className="n">{isToday ? `${c.day} · today` : c.day}</span>
              <div className="stack">
                {releases.slice(0, inlineCount).map((r, ri) => (
                  <div key={ri} className="cal-event">
                    <span className={`pdot ${r.k}`} />
                    <span className="ttl">{r.t}</span>
                  </div>
                ))}
                {moreCount > 0 && <div className="cal-more">+ {moreCount} more →</div>}
              </div>

              <div className="cal-pop" role="tooltip">
                <div className="pop-head">
                  May {c.day} ·{' '}
                  <strong>
                    {releases.length} release{releases.length === 1 ? '' : 's'}
                  </strong>
                </div>
                {releases.slice(0, 5).map((r, ri) => (
                  <div key={ri} className="pop-item">
                    <span
                      className="pop-cv"
                      style={{
                        background: `linear-gradient(170deg, hsl(${r.hue} 35% 22%), hsl(${r.hue} 30% 12%))`,
                      }}
                    >
                      { }
                      <img src={`/img/cover-${r.isbn}.jpg`} alt="" loading="eager" />
                    </span>
                    <div className="pop-info">
                      <div className="ttl">{r.t}</div>
                      <div className="sub">{r.sub}</div>
                    </div>
                  </div>
                ))}
                <div className="pop-foot">
                  View all {releases.length > 5 ? `${releases.length} ` : ''}releases →
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function FeatureGrid(): React.JSX.Element {
  return (
    <section className="section">
      <div className="wrap">
        <div className="section-head">
          <div>
            <span className="eyebrow">features</span>
            <h2 className="section-title">Everything you&apos;d expect, plus the bookish bits.</h2>
          </div>
          <p className="section-lede">
            If you&apos;ve run Sonarr or Radarr, you already know how this works. The vocabulary is
            identical: quality profiles, monitored series, root folders, interactive search. Just
            for the formats they ignore.
          </p>
        </div>

        <div className="features">
          {/* 1: Interactive search */}
          <div className="feature">
            <span className="num">interactive search</span>
            <div className="name">Pick the release yourself.</div>
            <div className="desc">
              When automatic isn&apos;t enough, run an interactive search. Bookkeeprr ranks releases
              by quality, peers, age, and language; you click the one you want.
            </div>
            <div className="preview">
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  color: 'var(--muted-2)',
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  marginBottom: 8,
                }}
              >
                12 RELEASES · 4 INDEXERS
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 0',
                  borderTop: '1px solid var(--border)',
                }}
              >
                <span className="pill primary" style={{ fontSize: 9 }}>
                  CBZ HQ
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10.5,
                    color: 'var(--fg)',
                    flex: 1,
                  }}
                >
                  v28.[Stevenmagnet].cbz
                </span>
                <span
                  className="live-dot"
                  style={{
                    background: 'var(--ok)',
                    boxShadow: '0 0 0 2px oklch(from var(--ok) l c h / 0.2)',
                    animation: 'none',
                  }}
                ></span>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 0',
                  borderTop: '1px solid var(--border)',
                }}
              >
                <span className="pill primary" style={{ fontSize: 9 }}>
                  CBZ HQ
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10.5,
                    color: 'var(--fg)',
                    flex: 1,
                  }}
                >
                  v28.[Kodansha].cbz
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 9.5,
                    color: 'var(--muted-2)',
                  }}
                >
                  412 MIB
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 0',
                  borderTop: '1px solid var(--border)',
                }}
              >
                <span
                  className="pill"
                  style={{
                    fontSize: 9,
                    color: 'var(--err)',
                    borderColor: 'oklch(from var(--err) l c h / 0.35)',
                    background: 'oklch(from var(--err) l c h / 0.12)',
                  }}
                >
                  REJECT
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10.5,
                    color: 'var(--muted)',
                    flex: 1,
                    textDecoration: 'line-through',
                  }}
                >
                  v28.RAW.JP.cbr
                </span>
              </div>
            </div>
          </div>

          {/* 2: Quality profiles */}
          <div className="feature">
            <span className="num">quality profiles</span>
            <div className="name">Cutoff &amp; upgrades.</div>
            <div className="desc">
              Build a stack of preferred formats. Bookkeeprr keeps upgrading until your cutoff
              lands, then leaves it alone. Per-series overrides for the difficult ones.
            </div>
            <div className="preview qp-list">
              <div className="opt">
                <span className="rad"></span>
                <span className="name">Any</span>
                <span className="meta">no cutoff</span>
              </div>
              <div className="opt on">
                <span className="rad"></span>
                <span className="name">Manga · CBZ HQ</span>
                <span className="meta">cutoff: cbz-hq</span>
              </div>
              <div className="opt">
                <span className="rad"></span>
                <span className="name">eBook · EPUB only</span>
                <span className="meta">epub</span>
              </div>
              <div className="opt">
                <span className="rad"></span>
                <span className="name">Audio · M4B</span>
                <span className="meta">m4b</span>
              </div>
            </div>
          </div>

          {/* 3: Notifications — iOS push lock-screen card */}
          <div className="feature">
            <span className="num">notifications</span>
            <div className="name">Hear about it where you live.</div>
            <div className="desc">
              iOS &amp; Android push, Discord, Apprise, SMTP. Per-event matrix; pick which channels
              fire for which events.
            </div>
            <div className="preview">
              <div className="ios-push">
                <div className="app-ico">
                  <svg viewBox="0 0 64 64" width="18" height="18">
                    <circle cx="32" cy="32" r="30" fill="#fff" />
                    <rect x="14" y="22.5" width="32" height="5" rx="1" fill="var(--primary)" />
                    <rect x="14" y="30.5" width="36" height="5" rx="1" fill="var(--primary)" />
                    <rect x="14" y="38.5" width="22" height="5" rx="1" fill="var(--primary)" />
                  </svg>
                </div>
                <div className="meta">
                  <div className="head">
                    <span className="app-name">bookkeeprr</span>
                  </div>
                  <div className="ttl">Vinland Saga · v28 imported</div>
                  <div className="body">461 MiB · NYAA · 12 seeders</div>
                </div>
                <span className="time">now</span>
              </div>
            </div>
          </div>

          {/* 4: Calendar */}
          <div className="feature feature-cal">
            <span className="num">calendar</span>
            <div className="name">Know what&apos;s coming.</div>
            <div className="desc">
              Upcoming releases painted onto a calendar; counts per day, ICS export, click any day
              for the full schedule.
            </div>
            <div className="preview cal-preview-v2">
              <CalendarPreview />
            </div>
          </div>

          {/* 6: Audit log */}
          <div className="feature">
            <span className="num">audit log</span>
            <div className="name">Who did what, when.</div>
            <div className="desc">
              Every write is logged with actor, timestamp, target and JSON diff. 90-day retention,
              CSV export. Filter by user, role, or verb.
            </div>
            <div className="preview audit-mini">
              <div className="ev">
                <span className="tag c">+</span>
                <span className="what">added series · Vinland Saga</span>
                <span className="when">17:42</span>
              </div>
              <div className="ev">
                <span className="tag u">~</span>
                <span className="what">edited quality profile</span>
                <span className="when">17:36</span>
              </div>
              <div className="ev">
                <span className="tag d">−</span>
                <span className="what">removed indexer</span>
                <span className="when">16:58</span>
              </div>
              <div className="ev">
                <span className="tag c">+</span>
                <span className="what">invited user · lina@…</span>
                <span className="when">09:02</span>
              </div>
            </div>
          </div>

          {/* 7: Roles */}
          <div className="feature">
            <span className="num">roles</span>
            <div className="name">Admin, editor, reader.</div>
            <div className="desc">
              Three roles, sensible defaults. Admins manage everything. Editors monitor and grab.
              Readers browse-only. Per-user API keys.
            </div>
            <div className="preview roles-stack">
              <div className="role-row">
                <span
                  className="av"
                  style={{
                    background: 'oklch(0.32 0.10 305)',
                    color: 'oklch(0.86 0.08 305)',
                  }}
                >
                  MC
                </span>
                <span>Maya Chen</span>
                <span className="role-pill admin">Admin</span>
              </div>
              <div className="role-row">
                <span
                  className="av"
                  style={{
                    background: 'oklch(0.32 0.10 220)',
                    color: 'oklch(0.86 0.08 220)',
                  }}
                >
                  SK
                </span>
                <span>Sofia Karlsson</span>
                <span className="role-pill editor">Editor</span>
              </div>
              <div className="role-row">
                <span
                  className="av"
                  style={{
                    background: 'oklch(0.32 0.10 160)',
                    color: 'oklch(0.86 0.08 160)',
                  }}
                >
                  RM
                </span>
                <span>Rohan Mehta</span>
                <span className="role-pill">Reader</span>
              </div>
            </div>
          </div>

          {/* 8: Theming */}
          <div className="feature">
            <span className="num">theming</span>
            <div className="name">Pick your hue.</div>
            <div className="desc">
              Every interactive surface tints from a single CSS variable. Users pick their accent
              once in Settings. The whole UI follows, logo included.
            </div>
            <div className="preview" id="themePreview">
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <svg id="themeLogo" width="32" height="32" viewBox="0 0 64 64">
                  <circle cx="32" cy="32" r="30" fill="var(--primary)" />
                  <rect x="14" y="22.5" width="32" height="5" rx="1" fill="var(--bg)" />
                  <rect x="14" y="30.5" width="36" height="5" rx="1" fill="var(--bg)" />
                  <rect x="14" y="38.5" width="22" height="5" rx="1" fill="var(--bg)" />
                </svg>
                <ThemeSwatchPicker />
              </div>
              <div
                style={{
                  marginTop: 14,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  color: 'var(--muted-2)',
                  letterSpacing: '0.06em',
                }}
              >
                CLICK A SWATCH
              </div>
            </div>
          </div>

          {/* 8: Indexers */}
          <div className="feature">
            <span className="num">indexers</span>
            <div className="name">Bring your own.</div>
            <div className="desc">
              Nyaa, AnimeBytes, MangaDex, ComicVine; bookkeeprr speaks them natively, or pulls from
              a Prowlarr indexer manager.
            </div>
            <div className="preview">
              <div className="indexer-row">
                <span>Nyaa</span>
                <span
                  className="live-dot"
                  style={{
                    background: 'var(--ok)',
                    boxShadow: '0 0 0 2px oklch(from var(--ok) l c h / 0.2)',
                    animation: 'none',
                  }}
                ></span>
                <span className="lat">142 MS</span>
              </div>
              <div className="indexer-row">
                <span>AnimeBytes</span>
                <span
                  className="live-dot"
                  style={{
                    background: 'var(--ok)',
                    boxShadow: '0 0 0 2px oklch(from var(--ok) l c h / 0.2)',
                    animation: 'none',
                  }}
                ></span>
                <span className="lat">220 MS</span>
              </div>
              <div className="indexer-row">
                <span>MangaDex</span>
                <span
                  className="live-dot"
                  style={{
                    background: 'var(--warn)',
                    boxShadow: '0 0 0 2px oklch(from var(--warn) l c h / 0.2)',
                    animation: 'none',
                  }}
                ></span>
                <span className="lat">1.2 S</span>
              </div>
              <div className="indexer-row">
                <span>Prowlarr</span>
                <span
                  className="live-dot"
                  style={{
                    background: 'var(--ok)',
                    boxShadow: '0 0 0 2px oklch(from var(--ok) l c h / 0.2)',
                    animation: 'none',
                  }}
                ></span>
                <span className="lat">96 MS</span>
              </div>
            </div>
          </div>

          {/* 9: API & webhooks */}
          <div className="feature">
            <span className="num">api &amp; webhooks</span>
            <div className="name">Wire it into your stack.</div>
            <div className="desc">
              Documented REST API, event webhooks, per-user keys. Drop bookkeeprr into Home
              Assistant, n8n, or your own scripts.
            </div>
            <div
              className="preview"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11.5,
                lineHeight: 1.65,
                color: 'var(--fg-soft)',
              }}
            >
              <div>
                <span style={{ color: 'var(--t-novel)' }}>GET</span> /api/series
                <span style={{ color: 'var(--muted-2)' }}>?monitored=true</span>
              </div>
              <div>
                <span style={{ color: 'var(--t-ebook)' }}>POST</span> /api/series/{'{id}'}/search
              </div>
              <div>
                <span style={{ color: 'var(--t-comic)' }}>PATCH</span> /api/profiles/{'{id}'}
              </div>
              <div
                style={{
                  marginTop: 8,
                  paddingTop: 8,
                  borderTop: '1px solid var(--border)',
                  color: 'var(--muted-2)',
                  letterSpacing: '0.04em',
                }}
              >
                WEBHOOK · series.imported → my-bot
              </div>
            </div>
          </div>

          {/* 10: OIDC & RBAC */}
          <div className="feature">
            <span className="num">oidc &amp; rbac</span>
            <div className="name">Federated sign-in.</div>
            <div className="desc">
              Plug in Authentik, Authelia, Keycloak, anything OIDC-compliant. Map provider groups to
              bookkeeprr roles. Reverse-proxy header auth supported too.
            </div>
            <div className="preview oidc-fields">
              <div className="row">
                <span>DISCOVERY</span>
                <span className="v ok">auth.example.org</span>
              </div>
              <div className="row">
                <span>CLIENT</span>
                <span className="v">bookkeeprr</span>
              </div>
              <div className="row">
                <span>SCOPES</span>
                <span className="v">openid · profile · groups</span>
              </div>
              <div className="row">
                <span>MAPPING</span>
                <span className="v">bk-admins → Admin</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
