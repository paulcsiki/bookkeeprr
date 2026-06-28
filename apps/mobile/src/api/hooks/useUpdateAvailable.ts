import { AppConfig } from '@/lib/appConfig';
import { useVersionCheck } from './useVersionCheck';

function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map((x) => parseInt(x, 10));
  const pb = b.split('.').map((x) => parseInt(x, 10));
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

export function useUpdateAvailable() {
  const v = useVersionCheck();
  const mobile = AppConfig.version;
  const serverCurrent = v.data?.current ?? null;
  const available = serverCurrent !== null && compareSemver(mobile, serverCurrent) < 0;
  return { available, mobile, serverCurrent, isLoading: v.isLoading };
}
