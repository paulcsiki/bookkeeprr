import { redirect } from 'next/navigation';
import { getActor } from '@/server/auth/get-actor';
import { CONTENT_TYPES } from '@/server/content-type';
import {
  contentTypePathsSetting,
  torrentCleanupSetting,
  imageCacheSetting,
  getImageCacheDir,
} from '@/server/db/settings/library';
import { getLibraryDir, getQbtCategory } from '@/server/content-type/paths';
import { PageHeader } from '@/components/shell/PageHeader';
import { StorageForm, type StorageFallbacks } from './StorageForm';

export const dynamic = 'force-dynamic';

export default async function SettingsStoragePage(): Promise<React.JSX.Element> {
  const actor = await getActor();
  if (actor === null) redirect('/login?next=/settings/storage');
  if (actor.role !== 'admin') redirect('/settings');

  const [contentTypePaths, torrentCleanup, imageCache, imageCacheDirDefault] = await Promise.all([
    contentTypePathsSetting.get(),
    torrentCleanupSetting.get(),
    imageCacheSetting.get(),
    getImageCacheDir(),
  ]);

  // Effective fallback values shown as input placeholders when a field is blank.
  const fallbacks = {} as StorageFallbacks;
  await Promise.all(
    CONTENT_TYPES.map(async (t) => {
      const [libraryRoot, qbtCategory] = await Promise.all([
        getLibraryDir(t),
        getQbtCategory(t),
      ]);
      fallbacks[t] = { libraryRoot, qbtCategory };
    }),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Storage"
        subtitle="Per-content-type library paths and qBittorrent categories, plus torrent cleanup."
      />
      <StorageForm
        initialPaths={contentTypePaths}
        initialCleanup={torrentCleanup}
        initialImageCache={imageCache}
        imageCacheDirDefault={imageCacheDirDefault}
        fallbacks={fallbacks}
      />
    </div>
  );
}
