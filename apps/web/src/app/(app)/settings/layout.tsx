import { SettingsNav } from '@/components/shell/SettingsNav';

/**
 * Two-column settings shell (design system `.settings-frame`): a left rail of
 * grouped categories + the content pane. Wraps every /settings/* route so the
 * navigation chrome is consistent across all settings pages.
 */
export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex h-[calc(100dvh-104px)] overflow-hidden rounded-2xl border border-border bg-background">
      <div className="w-[220px] shrink-0 overflow-y-auto border-r border-border bg-card p-3">
        <SettingsNav />
      </div>
      <div className="min-w-0 flex-1 overflow-y-auto px-6 py-7 md:px-8">{children}</div>
    </div>
  );
}
