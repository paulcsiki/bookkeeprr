import ipaddr from 'ipaddr.js';

export function isIpInCidrList(ip: string, cidrs: string[]): boolean {
  if (cidrs.length === 0) return false;
  let addr;
  try {
    addr = ipaddr.parse(ip);
    if (addr.kind() === 'ipv6' && (addr as ipaddr.IPv6).isIPv4MappedAddress()) {
      addr = (addr as ipaddr.IPv6).toIPv4Address();
    }
  } catch {
    return false;
  }
  for (const cidr of cidrs) {
    try {
      const [net, prefix] = ipaddr.parseCIDR(cidr);
      if (addr.kind() === net.kind() && addr.match([net, prefix])) return true;
    } catch {
      continue;
    }
  }
  return false;
}

export function isCidrValid(cidr: string): boolean {
  try {
    ipaddr.parseCIDR(cidr);
    return true;
  } catch {
    return false;
  }
}
