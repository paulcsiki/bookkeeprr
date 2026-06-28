import { QueryProvider } from '@/components/QueryProvider';

/**
 * The reader route group's layout. The ROOT layout (`app/layout.tsx`) already
 * provides `<html>`/`<body>`, the three fonts, the accent `ThemeProvider`, and
 * the dark `bg-background` — so this nested layout deliberately does NOT
 * re-wrap any of those (double-wrapping ThemeProvider would mount two
 * next-themes providers).
 *
 * It adds only what the app shell would normally supply but the reader must NOT
 * inherit: `QueryProvider` (for `useManifest` / `useProgress`) inside a
 * full-bleed wrapper with NO Sidebar / TopBar.
 */
export default function ReaderLayout({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <QueryProvider>
      <div className="h-screen w-screen overflow-hidden bg-background">{children}</div>
    </QueryProvider>
  );
}
