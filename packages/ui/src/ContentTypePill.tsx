import { cn } from './utils';
import type { ContentType } from '@bookkeeprr/types';

/**
 * Content-type → CSS accent token. These accents are FIXED across themes
 * (manga is always warm rose, etc.). Canonical source — reused by
 * `<ContentTypePill>`, `<Cover>`, and anywhere a type needs its colour.
 */
export const CONTENT_TYPE_VAR: Record<ContentType, string> = {
  manga: '--color-manga',
  comic: '--color-comic',
  light_novel: '--color-novel',
  ebook: '--color-ebook',
  audiobook: '--color-audio',
};

/** Content-type → short human label used on chips and fallback covers. */
export const CONTENT_TYPE_LABEL: Record<ContentType, string> = {
  manga: 'Manga',
  comic: 'Comic',
  light_novel: 'Novel',
  ebook: 'eBook',
  audiobook: 'Audio',
};

const TYPE_VAR = CONTENT_TYPE_VAR;
const TYPE_LABEL = CONTENT_TYPE_LABEL;

type Props = {
  type: ContentType;
  className?: string;
};

/**
 * Content-type chip — fixed accent per type, independent of the user's
 * picked theme. Glance at a card and you know what shape it is.
 *
 * Colors live as OKLCH tokens (`--color-manga` etc.) in @bookkeeprr/tokens.
 */
export function ContentTypePill({ type, className }: Props): React.JSX.Element {
  const cssVar = TYPE_VAR[type];
  return (
    <span
      className={cn(
        'inline-flex h-[22px] items-center gap-1.5 rounded-full border px-2.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.10em]',
        className,
      )}
      style={{
        backgroundColor: 'var(--color-card)',
        color: `var(${cssVar})`,
        borderColor: `oklch(from var(${cssVar}) l c h / 0.5)`,
      }}
    >
      {TYPE_LABEL[type]}
    </span>
  );
}
