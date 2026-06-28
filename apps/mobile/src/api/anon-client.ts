import { HandshakeResponse, VersionResponse } from './schemas';

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

export async function handshake(serverUrl: string) {
  const raw = await fetchJson(`${serverUrl.replace(/\/$/, '')}/api/mobile/handshake`);
  return HandshakeResponse.parse(raw);
}

export async function fetchVersion(serverUrl: string) {
  const raw = await fetchJson(`${serverUrl.replace(/\/$/, '')}/api/mobile/version`);
  return VersionResponse.parse(raw);
}
