export function Cta(): React.JSX.Element {
  return (
    <section className="cta-strip">
      <div className="wrap">
        <span className="eyebrow">ready when you are</span>
        <h2 className="head">
          Stop forgetting volume <span className="accent">28</span>.
        </h2>
        <p className="sub">
          Five minutes from{' '}
          <span className="mono" style={{ color: 'var(--fg)' }}>
            docker compose up
          </span>{' '}
          to a watched library. Pick your hue, mount your media, get back to reading.
        </p>
        <div className="actions">
          <a href="#start" className="btn btn-primary btn-lg">
            Self-host bookkeeprr
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
            Read the source
          </a>
        </div>
      </div>
    </section>
  );
}
