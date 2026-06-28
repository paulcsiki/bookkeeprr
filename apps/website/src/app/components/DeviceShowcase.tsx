import { MobLibraryGridMock, TabLibraryGridMock } from './DeviceMocks';

export function DeviceShowcase(): React.JSX.Element {
  return (
    <section className="section devices-section">
      <div className="wrap">
        <div className="devices-grid">
          <div className="copy">
            <span className="eyebrow">mobile &amp; tablet</span>
            <h3>
              Your library, <em>everywhere you read.</em>
            </h3>
            <p className="desc">
              Pick up right where you left off, wherever you are. Your whole collection rides in your
              pocket, fresh releases land the moment they drop, and your next read is one tap away
              from the couch or the checkout line.
            </p>

            <div className="features-mini">
              <div className="feat-mini">
                <span className="ico">
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
                    <rect x="6" y="2" width="12" height="20" rx="3" />
                    <path d="M11 18h2" />
                  </svg>
                </span>
                <div>
                  <div className="name">Browse your library from anywhere</div>
                  <div className="body">
                    Same grid &amp; list views, full search, monitored counts.
                  </div>
                </div>
              </div>
              <div className="feat-mini">
                <span className="ico">
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
                    <circle cx="11" cy="11" r="7" />
                    <path d="m20 20-3.5-3.5" />
                  </svg>
                </span>
                <div>
                  <div className="name">Add &amp; request on the go</div>
                  <div className="body">
                    Spotted something at the bookshop? Add it, monitor it, walk away.
                  </div>
                </div>
              </div>
              <div className="feat-mini">
                <span className="ico">
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
                    <path d="M18 16v-5a6 6 0 0 0-12 0v5l-2 2h16z" />
                    <path d="M9 19a3 3 0 0 0 6 0" />
                  </svg>
                </span>
                <div>
                  <div className="name">Push notifications</div>
                  <div className="body">
                    Volume imported, indexer down, missing release; all without leaving the home
                    screen.
                  </div>
                </div>
              </div>
            </div>

            <div className="badges store-badges">
              <a className="store-badge" href="#" aria-label="Download on the App Store">
                <span className="ico">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.05 12.04c-.03-3.07 2.51-4.54 2.62-4.61-1.43-2.09-3.65-2.38-4.44-2.41-1.89-.19-3.69 1.11-4.65 1.11-.97 0-2.45-1.08-4.02-1.05-2.07.03-3.97 1.2-5.04 3.05-2.15 3.73-.55 9.24 1.54 12.27 1.04 1.48 2.27 3.14 3.88 3.08 1.56-.06 2.15-1.01 4.04-1.01s2.42 1.01 4.07.98c1.68-.03 2.74-1.5 3.77-3 1.19-1.72 1.68-3.39 1.71-3.48-.04-.02-3.28-1.26-3.31-4.93zM14.07 3.92c.85-1.03 1.43-2.47 1.27-3.92-1.23.05-2.71.81-3.59 1.83-.79.91-1.49 2.38-1.3 3.78 1.37.11 2.78-.7 3.62-1.69z" />
                  </svg>
                </span>
                <span className="lbl">
                  <span className="small">Download on the</span>
                  <span className="big">App Store</span>
                </span>
              </a>
              <a className="store-badge" href="#" aria-label="Get it on Google Play">
                <span className="ico">
                  <svg width="22" height="22" viewBox="0 0 24 24">
                    <path
                      fill="#01875f"
                      d="M3.6 1.3c-.4.4-.6.9-.6 1.6v18.2c0 .7.2 1.3.6 1.6l.1.1 10.2-10.2v-.2-.2L3.6 1.3z"
                    />
                    <path
                      fill="#ffc107"
                      d="M17.3 15.6L14 12.3v-.2-.2l3.3-3.3.1.1 4 2.3c1.1.6 1.1 1.7 0 2.3l-4 2.3z"
                    />
                    <path
                      fill="#ea4335"
                      d="M17.4 15.5l-3.5-3.4L3.6 22.6c.4.4 1 .4 1.7.1l12.1-7.2z"
                    />
                    <path
                      fill="#1976d2"
                      d="M17.4 8.5L5.3 1.4C4.6 1 4 1.1 3.6 1.5l10.3 10.3 3.5-3.3z"
                    />
                  </svg>
                </span>
                <span className="lbl">
                  <span className="small">GET IT ON</span>
                  <span className="big">Google Play</span>
                </span>
              </a>
            </div>
          </div>

          <div className="devices-stage">
            {/* iPad frame — bezel + home indicator wrapping a live MobLibraryGrid
                mount. The status bar is rendered inside the mock so we only
                paint it once. */}
            <div
              className="dev-tab-frame"
              role="img"
              aria-label="Bookkeeprr on iPad · Library grid view"
            >
              <div className="screen">
                <TabLibraryGridMock />
              </div>
              <div className="home-indicator" />
            </div>

            {/* iPhone frame — phone-frame.png overlay (drawn as a CSS background
                via ::before) wrapping a live MobLibraryGrid mount. */}
            <div
              className="dev-mob-frame"
              role="img"
              aria-label="Bookkeeprr on iPhone 17 Pro · Library grid view"
            >
              <div className="phone-screen">
                <MobLibraryGridMock />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
