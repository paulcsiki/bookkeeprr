export function Integrations(): React.JSX.Element {
  return (
    <section className="section">
      <div className="wrap">
        <div className="section-head">
          <div>
            <span className="eyebrow">integrations</span>
            <h2 className="section-title">Plays well with the stack.</h2>
          </div>
          <p className="section-lede">
            Bookkeeprr is happiest sitting next to Sonarr, Radarr and Prowlarr. It speaks the same
            indexers, the same download clients, the same notification fan-outs.
          </p>
        </div>

        <div className="integrations-bar">
          <div className="intg-tile">
            <div className="ico">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.317 4.369A19.79 19.79 0 0 0 16.558 3.1a14.36 14.36 0 0 0-.617 1.244 18.27 18.27 0 0 0-5.487 0A12.84 12.84 0 0 0 9.83 3.1a19.79 19.79 0 0 0-3.762 1.27C2.7 9.054 1.79 13.62 2.245 18.118a19.94 19.94 0 0 0 5.998 2.93 14.74 14.74 0 0 0 1.276-2.04 12.93 12.93 0 0 1-2.014-.951c.169-.122.334-.249.494-.379a14.25 14.25 0 0 0 12.002 0c.16.13.325.257.494.379a12.96 12.96 0 0 1-2.018.953 14.61 14.61 0 0 0 1.276 2.04 19.93 19.93 0 0 0 6-2.93c.512-5.176-.748-9.7-3.436-13.749ZM9.012 15.402c-1.192 0-2.176-1.082-2.176-2.41 0-1.327.964-2.41 2.176-2.41 1.212 0 2.197 1.083 2.176 2.41 0 1.328-.964 2.41-2.176 2.41Zm5.976 0c-1.192 0-2.176-1.082-2.176-2.41 0-1.327.964-2.41 2.176-2.41 1.212 0 2.197 1.083 2.176 2.41 0 1.328-.964 2.41-2.176 2.41Z" />
              </svg>
            </div>
            <div className="name">Discord</div>
          </div>
          <div className="intg-tile">
            <div className="ico">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16" />
                <circle cx="5" cy="19" r="1.5" fill="currentColor" />
              </svg>
            </div>
            <div className="name">Apprise</div>
          </div>
          <div className="intg-tile">
            <div className="ico">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 7l9 6 9-6" />
                <rect x="3" y="5" width="18" height="14" rx="2" />
              </svg>
            </div>
            <div className="name">SMTP</div>
          </div>
          <div className="intg-tile">
            <div className="ico">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 2 4 6v6c0 5 3.5 9 8 10 4.5-1 8-5 8-10V6z" />
              </svg>
            </div>
            <div className="name">Authentik</div>
          </div>
          <div className="intg-tile">
            <div className="ico">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="3" width="18" height="18" rx="3" />
                <path d="M8 8h8M8 12h8M8 16h5" />
              </svg>
            </div>
            <div className="name">Authelia</div>
          </div>
          <div className="intg-tile">
            <div className="ico">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 3v18M3 12h18M5 6c4 3 10 3 14 0M5 18c4-3 10-3 14 0" />
              </svg>
            </div>
            <div className="name">Keycloak</div>
          </div>
          <div className="intg-tile">
            <div className="ico">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="m8 12 3 3 5-7" />
              </svg>
            </div>
            <div className="name">qBittorrent</div>
          </div>
          <div className="intg-tile">
            <div className="ico">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="3" width="18" height="18" rx="3" />
                <path d="m8 8 8 8M16 8l-8 8" />
              </svg>
            </div>
            <div className="name">Transmission</div>
          </div>
        </div>
      </div>
    </section>
  );
}
