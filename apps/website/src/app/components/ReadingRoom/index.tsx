'use client';

import { type JSX, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChromeWindow } from './ChromeWindow';
import { TextReader } from './TextReader';
import { BOOK_EBOOK } from './data';

const NATIVE_W = 1320;
const NATIVE_H = 824;
const PAD = 44;

/**
 * ReadingRoom — full-bleed marketing band hosting the real reader inside a
 * Safari-style ChromeWindow. Matches docs/design/handoff-2026-06-01/.../index.html
 * (#reader-mock-mount + mountReader IIFE). The 1320×824 native reader is
 * scaled to fit the band; the fullscreen button maximises the band via the
 * Fullscreen API.
 */
export function ReadingRoom(): JSX.Element {
  const mountRef = useRef<HTMLDivElement>(null);
  const scalerRef = useRef<HTMLDivElement>(null);
  const scrollYRef = useRef(0);
  const [initialTheme, setInitialTheme] = useState<'paper' | 'dark'>('dark');
  const [fs, setFs] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Resolve the initial reader theme from the user's OS preference (light → paper).
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia('(prefers-color-scheme: light)');
    setInitialTheme(mql.matches ? 'paper' : 'dark');
    setMounted(true);
  }, []);

  // Scale the 1320×824 native reader to fit the band.
  const fit = () => {
    const mount = mountRef.current;
    const scaler = scalerRef.current;
    if (!mount || !scaler) return;
    const w = mount.clientWidth;
    const h = mount.clientHeight;
    if (!w || !h) return;
    const fullscreen = typeof document !== 'undefined' && !!document.fullscreenElement;
    const pad = fullscreen ? 0 : PAD;
    const s = Math.min((w - pad * 2) / NATIVE_W, (h - pad * 2) / NATIVE_H);
    const sw = NATIVE_W * s;
    const sh = NATIVE_H * s;
    scaler.style.transform = `translate(${(w - sw) / 2}px, ${(h - sh) / 2}px) scale(${s})`;
  };

  useLayoutEffect(() => {
    fit();
    const onResize = () => fit();
    window.addEventListener('resize', onResize);
    const onFs = () => {
      const isFs = !!document.fullscreenElement;
      setFs(isFs);
      fit();
      setTimeout(fit, 60);
      setTimeout(fit, 250);
      // Browsers don't always preserve page scroll across fullscreen toggles;
      // restore the position we captured when entering.
      if (!isFs && scrollYRef.current > 0) {
        const y = scrollYRef.current;
        requestAnimationFrame(() => {
          window.scrollTo({ top: y, left: 0, behavior: 'auto' });
        });
      }
    };
    document.addEventListener('fullscreenchange', onFs);
    const t1 = window.setTimeout(fit, 200);
    return () => {
      window.removeEventListener('resize', onResize);
      document.removeEventListener('fullscreenchange', onFs);
      window.clearTimeout(t1);
    };
  }, [mounted]);

  const toggleFs = () => {
    if (typeof document === 'undefined') return;
    const mount = mountRef.current;
    if (!mount) return;
    if (!document.fullscreenElement) {
      scrollYRef.current = window.scrollY;
      void mount.requestFullscreen?.();
    } else {
      void document.exitFullscreen?.();
    }
  };

  return (
    <section className="section reader-band" id="reader">
      <div className="wrap">
        <div className="section-head" style={{ marginBottom: 0 }}>
          <div className="section-head-top">
            <span className="eyebrow">and then you read</span>
            <h2 className="section-title">
              A reading room, <em>not just a download queue.</em>
            </h2>
          </div>
          <p className="section-lede">
            Every grab lands in a real reader — reflowable text with true two-up pagination, four
            chrome-matching themes, and live type, spacing &amp; brightness. Open the display
            controls inside the reader to make it yours; your place syncs across every device.
          </p>
        </div>
      </div>
      <div className="reader-stage" ref={mountRef}>
        <div
          ref={scalerRef}
          className="rw-scaler"
          style={{ width: NATIVE_W, height: NATIVE_H }}
        >
          {mounted && (
            <ChromeWindow
              width={NATIVE_W}
              height={NATIVE_H}
              url="bookkeeprr.app/read/lantern-of-the-deep"
              tabs={[{ title: BOOK_EBOOK.title }]}
            >
              <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                <TextReader
                  book={BOOK_EBOOK}
                  platform="web"
                  pid="landing-reader"
                  startPos={0.34}
                  fs={fs}
                  onFullscreen={toggleFs}
                  initial={{ theme: initialTheme, spread: true }}
                />
              </div>
            </ChromeWindow>
          )}
        </div>
      </div>
    </section>
  );
}
