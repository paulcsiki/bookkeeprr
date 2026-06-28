import { redirect } from 'next/navigation';

// Settings has no standalone landing — the left rail is the navigation.
// Send /settings to the first category so the shell always shows a real page.
export default function SettingsPage(): never {
  redirect('/settings/updates');
}
