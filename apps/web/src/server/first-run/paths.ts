import { accessSync, constants as fsConstants } from 'node:fs';
import { getMediaRoot } from '@/server/content-type/paths';

export type PathStatus = 'writable' | 'not-writable' | 'missing';
export type FirstRunPaths = {
  configDir: { path: string; status: PathStatus };
  mediaRoot: { path: string; status: PathStatus };
  configEnvSet: boolean;
  mediaEnvSet: boolean;
};

export function checkPath(p: string): PathStatus {
  try {
    accessSync(p, fsConstants.W_OK);
    return 'writable';
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return 'missing';
    return 'not-writable';
  }
}

export async function resolveFirstRunPaths(): Promise<FirstRunPaths> {
  const configEnvSet = (process.env.BOOKKEEPRR_CONFIG_DIR ?? '').length > 0;
  const mediaEnvSet = (process.env.BOOKKEEPRR_MEDIA_ROOT ?? '').length > 0;
  const configDir = process.env.BOOKKEEPRR_CONFIG_DIR ?? '/config';
  const mediaRoot = await getMediaRoot();
  return {
    configDir: { path: configDir, status: checkPath(configDir) },
    mediaRoot: { path: mediaRoot, status: checkPath(mediaRoot) },
    configEnvSet,
    mediaEnvSet,
  };
}
