function ArrowIcon(): React.JSX.Element {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14M13 5l7 7-7 7" />
    </svg>
  );
}

export function HowItWorks(): React.JSX.Element {
  return (
    <section className="section">
      <div className="wrap">
        <div className="section-head">
          <div>
            <span className="eyebrow">how it works</span>
            <h2 className="section-title">Source &rarr; bookkeeprr &rarr; you.</h2>
          </div>
          <p className="section-lede">
            Three jobs, one process. Pick what you want, bookkeeprr finds it, your download client
            grabs it, and the right people hear about it.
          </p>
        </div>

        <div className="flow">
          {/* Node 1 — Sources */}
          <div className="flow-node">
            <span className="num">sources</span>
            <div className="name">It watches your sources.</div>
            <div className="desc">
              Pull metadata from AniList, MangaDex, ComicVine, OpenLibrary and Audnex. Pull releases
              from indexers like Nyaa, AnimeBytes, and Prowlarr. Bookkeeprr polls, ranks, and
              reconciles.
            </div>
            <div className="icons">
              <span className="src-chip">
                <span className="dot" style={{ background: 'var(--t-manga)' }}></span>
                MangaDex
              </span>
              <span className="src-chip">
                <span className="dot" style={{ background: 'var(--t-novel)' }}></span>
                AniList
              </span>
              <span className="src-chip">
                <span className="dot" style={{ background: 'var(--t-comic)' }}></span>
                ComicVine
              </span>
              <span className="src-chip">
                <span className="dot" style={{ background: 'var(--t-ebook)' }}></span>
                OpenLibrary
              </span>
              <span className="src-chip">
                <span className="dot" style={{ background: 'var(--t-audio)' }}></span>
                Audnex
              </span>
            </div>
          </div>

          <div className="flow-arrow">
            <ArrowIcon />
          </div>

          {/* Node 2 — bookkeeprr */}
          <div className="flow-node">
            <span className="num">bookkeeprr</span>
            <div className="name">It picks the right releases.</div>
            <div className="desc">
              Quality profiles decide what gets grabbed. Naming templates and root folders decide
              where it lands. Per-series overrides keep edge cases sane.
            </div>
            <div className="icons">
              <span className="src-chip">
                <span className="dot" style={{ background: 'var(--primary)' }}></span>
                Quality profile · CBZ HQ
              </span>
              <span className="src-chip">
                <span className="dot" style={{ background: 'var(--info)' }}></span>
                {'{series} - v{vol:2}'}
              </span>
            </div>
          </div>

          <div className="flow-arrow">
            <ArrowIcon />
          </div>

          {/* Node 3 — Destination */}
          <div className="flow-node">
            <span className="num">destination</span>
            <div className="name">It tells you where to find it.</div>
            <div className="desc">
              Hands the grab to qBittorrent or transmission. Imports the file when it lands.
              Notifies Discord, Apprise, or SMTP about the parts that matter.
            </div>
            <div className="icons">
              <span className="src-chip">
                <span className="dot" style={{ background: 'var(--ok)' }}></span>
                qBittorrent
              </span>
              <span className="src-chip">
                <span className="dot" style={{ background: 'var(--warn)' }}></span>
                Discord
              </span>
              <span className="src-chip">
                <span className="dot" style={{ background: 'var(--t-novel)' }}></span>
                Apprise
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
