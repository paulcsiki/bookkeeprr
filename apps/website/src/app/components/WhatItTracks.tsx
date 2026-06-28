import { ContentTypePill } from '@bookkeeprr/ui';
import type { ContentType } from '@bookkeeprr/types';

type CardDef = {
  type: ContentType;
  hue: string;
  name: string;
  desc: string;
  sources: string;
};

const CARDS: CardDef[] = [
  {
    type: 'manga',
    hue: 'var(--t-manga)',
    name: 'Manga',
    desc: 'Volumes and chapters. Tracks ongoing series, fills gaps, watches for new releases.',
    sources: 'AniList · MangaDex · Nyaa',
  },
  {
    type: 'light_novel',
    hue: 'var(--t-novel)',
    name: 'Light Novel',
    desc: 'Volume-tracked prose. Same author + series watcher as manga, different metadata.',
    sources: 'AniList LN · Bookwalker',
  },
  {
    type: 'comic',
    hue: 'var(--t-comic)',
    name: 'Comic',
    desc: 'Western singles and trades. Issue-level monitoring with publisher metadata.',
    sources: 'ComicVine · Animebytes',
  },
  {
    type: 'ebook',
    hue: 'var(--t-ebook)',
    name: 'eBook',
    desc: 'EPUB, MOBI, AZW3, PDF. Author-monitored, with calibre-style metadata.',
    sources: 'OpenLibrary · Hardcover',
  },
  {
    type: 'audiobook',
    hue: 'var(--t-audio)',
    name: 'Audiobook',
    desc: 'M4B and chaptered MP3. Series, narrator and runtime aware.',
    sources: 'Audnex · Audible',
  },
];

export function WhatItTracks(): React.JSX.Element {
  return (
    <section className="section" id="features">
      <div className="wrap">
        <div className="section-head">
          <div>
            <span className="eyebrow">what it tracks</span>
            <h2 className="section-title">Five corners of your library.</h2>
          </div>
          <p className="section-lede">
            Each content type owns its own metadata adapter, naming template, and indexer set.
            Glance at a cover and you know what shape it is.
          </p>
        </div>

        <div className="types-grid">
          {CARDS.map((card) => (
            <div
              key={card.type}
              className="type-card"
              style={{ '--hue': card.hue } as React.CSSProperties}
            >
              <ContentTypePill type={card.type} className="pill" />
              <div className="name">{card.name}</div>
              <div className="desc">{card.desc}</div>
              <div className="sources">{card.sources}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
