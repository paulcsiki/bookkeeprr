import {
  forwardAuthConfigSetting,
  isForwardAuthConfigured,
} from '@/server/db/settings/forward-auth';
import { isIpInCidrList } from './cidr';
import { extractProxyIp, extractClientIp } from './peer';
import { findOrProvisionForwardAuthUser, type ForwardAuthAttempt } from './provision';

export type { ForwardAuthAttempt };

export async function tryForwardAuth(req: Request): Promise<ForwardAuthAttempt> {
  const cfg = await forwardAuthConfigSetting.get();
  if (!isForwardAuthConfigured(cfg)) return { kind: 'not_applicable' };

  const peerIp = extractProxyIp(req);
  if (peerIp === null || !isIpInCidrList(peerIp, cfg.trustedProxies)) {
    return { kind: 'not_applicable' };
  }

  const username = req.headers.get(cfg.userHeader);
  if (username === null || username.length === 0) {
    return { kind: 'not_applicable' };
  }

  const email = req.headers.get(cfg.emailHeader);
  const groupsHeader = req.headers.get(cfg.groupsHeader);
  const groups =
    groupsHeader === null
      ? []
      : groupsHeader
          .split(',')
          .map((g) => g.trim())
          .filter((g) => g.length > 0);

  return findOrProvisionForwardAuthUser({
    username,
    email,
    groups,
    policy: {
      allowedGroups: cfg.allowedGroups,
      adminGroups: cfg.adminGroups,
      autoCreateUsers: cfg.autoCreateUsers,
    },
    peerIp,
    clientIp: extractClientIp(req),
    userAgent: req.headers.get('user-agent'),
  });
}
