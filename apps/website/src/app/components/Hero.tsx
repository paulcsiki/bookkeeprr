'use client';

import { VINLAND_ISBN, RE_ZERO_ISBN, HERO_GRID_ISBNS } from '../../lib/isbns';

/** Serve cached covers from /public/img/ so the hero never waits on OpenLibrary. */
function localCoverUrl(isbn: string): string {
  return `/img/cover-${isbn}.jpg`;
}

type GridCoverItem = (typeof HERO_GRID_ISBNS)[number];

function removeOnError(e: React.SyntheticEvent<HTMLImageElement>): void {
  const img = e.currentTarget;
  img.parentElement?.classList.remove('has-img');
  img.remove();
}

function removeImgOnError(e: React.SyntheticEvent<HTMLImageElement>): void {
  e.currentTarget.remove();
}

const PILL_LABEL: Record<GridCoverItem['type'], string> = {
  manga: 'Manga',
  novel: 'Novel',
  comic: 'Comic',
  ebook: 'eBook',
  audio: 'Audio',
};

export function Hero(): React.JSX.Element {
  return (
    <section className="hero">
      <div className="grid-bg"></div>
      <div className="wrap">
        {/* Left column */}
        <div>
          <span className="eyebrow">Self-hosted · MIT · open source</span>
          <h1>
            A reading-room for the <span className="accent">*arr</span> stack.
            <em>The arr the arr stack forgot.</em>
          </h1>
          <p className="lede">
            bookkeeprr watches, grabs, organises, and ships notifications for manga, light novels,
            comics, ebooks, and audiobooks. The corner of your library Sonarr and Radarr leave
            behind. One process, one Docker compose, one place to live.
          </p>
          <div className="cta-row">
            <a href="#start" className="btn btn-primary btn-lg">
              Get started
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            </a>
            <a
              href="https://github.com/paulcsiki/bookkeeprr"
              target="_blank"
              rel="noopener"
              className="btn btn-secondary btn-lg"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.1 3.29 9.42 7.86 10.95.58.1.79-.25.79-.55v-2.13c-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.69-1.28-1.69-1.04-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.95.1-.74.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.04 0 0 .97-.31 3.18 1.18a11.06 11.06 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.58.23 2.75.11 3.04.74.81 1.19 1.84 1.19 3.1 0 4.43-2.69 5.41-5.26 5.69.41.36.78 1.07.78 2.16v3.2c0 .31.21.66.8.55C20.21 21.42 23.5 17.1 23.5 12 23.5 5.65 18.35.5 12 .5Z" />
              </svg>
              Star on GitHub
            </a>
          </div>
          <div className="badges">
            <span>
              <CheckIcon />
              Docker compose
            </span>
            <span>
              <CheckIcon />
              Forms &amp; OIDC sign-in
            </span>
            <span>
              <CheckIcon />
              No telemetry
            </span>
            <span>
              <CheckIcon />
              Single binary
            </span>
          </div>
        </div>

        {/* Right column — animated showcase */}
        <div className="showcase">
          <div className="stage">
            {/* Background mini library grid */}
            <div className="mini-grid">
              {HERO_GRID_ISBNS.map((item) => (
                <div className="cover-card" key={item.isbn}>
                  <div
                    className="cover has-img"
                    style={{
                      background: `linear-gradient(160deg, hsl(${item.hue} 35% 22%), hsl(${item.hue} 30% 12%) 60%, hsl(240 10% 6%))`,
                    }}
                  >
                    <img
                      src={localCoverUrl(item.isbn)}
                      alt=""
                      loading="eager"
                      onError={removeOnError}
                    />
                    <span className={`pill ${item.type}`}>{PILL_LABEL[item.type]}</span>
                    <span className="title">{item.title}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Floating download progress card (front) */}
            <div className="floater queue">
              <div
                className="cv"
                style={{ background: 'linear-gradient(180deg, hsl(12 35% 22%), hsl(12 30% 12%))' }}
              >
                <img
                  src={localCoverUrl(VINLAND_ISBN)}
                  alt=""
                  loading="eager"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                  }}
                  onError={removeImgOnError}
                />
              </div>
              <div>
                <div className="top">
                  <span className="pill manga">Manga</span>
                  <span className="live-dot"></span>
                </div>
                <div className="name">Vinland Saga · vol. 28</div>
                <div className="progress">
                  <span></span>
                </div>
                <div className="meta">
                  <span>198 / 318 MIB</span>
                  <span>NYAA · 12 SEEDS</span>
                </div>
              </div>
            </div>

            {/* Floating series detail card (middle) */}
            <div className="floater series b">
              <div className="cv">
                <div
                  className="cover has-img"
                  style={{
                    background: 'linear-gradient(160deg, hsl(220 35% 22%), hsl(220 30% 12%))',
                  }}
                >
                  <img
                    src={localCoverUrl(RE_ZERO_ISBN)}
                    alt=""
                    loading="eager"
                    onError={removeOnError}
                  />
                </div>
              </div>
              <div>
                <span className="pill novel">Light Novel</span>
                <div className="ttl">
                  Re:Zero kara
                  <br />
                  Hajimeru
                </div>
                <div className="byline">Tappei Nagatsuki · ongoing</div>
                <div className="stats">
                  <div>
                    <div className="k">VOL</div>
                    <div className="v">
                      34
                      <span
                        className="mono"
                        style={{
                          fontSize: 11,
                          color: 'var(--muted)',
                          marginLeft: 3,
                          fontWeight: 400,
                        }}
                      >
                        /38
                      </span>
                    </div>
                  </div>
                  <div>
                    <div className="k">MISSING</div>
                    <div className="v" style={{ color: 'var(--warn)' }}>
                      4
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Floating toast */}
            <div className="floater toast c">
              <div className="ico">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m5 12 4 4L19 6" />
                </svg>
              </div>
              <div>
                <div className="ttl">Vinland Saga v27 imported</div>
                <div className="sub">461 MIB · /MEDIA/MANGA · 3.2S</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function CheckIcon(): React.JSX.Element {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}
