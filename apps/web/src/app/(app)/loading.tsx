import { TopLoadbar } from '@bookkeeprr/ui';

/**
 * Default loading UI for the (app) route group. Next.js mounts this when a
 * server segment is loading. The top loadbar gives the user immediate
 * feedback for any navigation that doesn't have a more specific loading.tsx.
 */
export default function Loading(): React.JSX.Element {
  return <TopLoadbar visible />;
}
