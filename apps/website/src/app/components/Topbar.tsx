import Link from 'next/link';
import { Logo } from '@bookkeeprr/ui';
import { APP_VERSION } from '../../lib/version';

export function Topbar(): React.JSX.Element {
  return (
    <header className="topbar" id="topbar">
      <div className="wrap">
        <Link href="/#top" className="brand">
          <Logo size={24} />
        </Link>
        <nav className="nav">
          <Link href="/#features">Features</Link>
          <Link href="/#demo">Demo</Link>
          <Link href="/#start">Get started</Link>
          <Link href="/#faq">FAQ</Link>
        </nav>
        <div className="right">
          <a
            href="https://github.com/paulcsiki/bookkeeprr"
            className="version-pill"
            target="_blank"
            rel="noopener"
          >
            <span className="dot"></span>
            v{APP_VERSION}
          </a>
          <Link href="/#start" className="btn btn-primary">
            Self-host
          </Link>
        </div>
      </div>
    </header>
  );
}
