type FaqItem = { q: string; a: React.ReactNode };

const ITEMS: FaqItem[] = [
  {
    q: 'Does it index content for me?',
    a: 'No. Bookkeeprr is a manager; it sits on top of indexers you bring (Nyaa, AnimeBytes, MangaDex, anything Prowlarr fronts) and orchestrates them. You provide the sources; bookkeeprr provides the logic.',
  },
  {
    q: 'Is it actually self-hosted?',
    a: 'Yes. Single container, your database, your library, your indexer credentials. No telemetry, no phone-home. The only outbound traffic is the API calls you configured.',
  },
  {
    q: 'Does it touch my existing media?',
    a: 'Only if you point it at the folder. Bookkeeprr is read-only by default for any path you mark "import existing." Naming templates only apply to new grabs unless you opt into a one-time rename.',
  },
  {
    q: 'Why not just use Readarr or LazyLibrarian?',
    a: "Use them if they work for you. Bookkeeprr is opinionated about manga, light novels, and comics; formats those tools handle reluctantly. The shell is the same; the metadata adapters and quality profiles aren't.",
  },
  {
    q: 'Can my partner / kids have their own account?',
    a: "Yes. Local accounts, OIDC federation, or both. Three roles: Admin, Editor, Reader, with sensible defaults. Per-user API keys for whatever you're scripting.",
  },
  {
    q: 'How do I get support?',
    a: "GitHub issues for bugs, GitHub Discussions for questions. There's a Discord server linked from the README.",
  },
  {
    q: 'License?',
    a: "MIT. Do what you want. If you ship it as a service, please don't call it bookkeeprr.",
  },
];

export function Faq(): React.JSX.Element {
  return (
    <section className="section" id="faq">
      <div className="wrap">
        <div className="section-head">
          <div>
            <span className="eyebrow">faq</span>
            <h2 className="section-title">Honest questions.</h2>
          </div>
          <p className="section-lede">
            If you&apos;ve run the *arr stack before you can probably skip this. If you
            haven&apos;t, here&apos;s the short version.
          </p>
        </div>

        <div className="faq">
          {ITEMS.map((item, i) => (
            <details key={i} className="faq-item">
              <summary>
                <span>{item.q}</span>
                <span className="chev" aria-hidden>
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
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </span>
              </summary>
              <div className="answer">{item.a}</div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
