import type { ContentType } from '@/server/content-type';

export type IndexerKind = 'nyaa' | 'filelist' | 'torznab' | 'manual' | 'mam';

export type NyaaCategory = '3_1' | '3_3';

export type NyaaConfig = {
  kind: 'nyaa';
  queryTemplate: string;
  contentTypes: ContentType[];
  categoryByContentType: Partial<Record<ContentType, NyaaCategory>>;
  pollIntervalSeconds: number;
};

export type FilelistConfig = {
  kind: 'filelist';
  queryTemplate: string;
  contentTypes: ContentType[];
  categoryByContentType: Partial<Record<ContentType, number>>;
  username: string;
  passkey: string;
  pollIntervalSeconds: number;
};

export type TorznabConfig = {
  kind: 'torznab';
  queryTemplate: string;
  contentTypes: ContentType[];
  /** Newznab category IDs per content type, comma-separated (e.g. "7020,8000"). */
  categoryByContentType: Partial<Record<ContentType, string>>;
  apiKey: string;
  pollIntervalSeconds: number;
  /** Set when this row is managed by Prowlarr auto-sync (the Prowlarr indexer id). */
  prowlarrIndexerId?: number;
};

// A sentinel indexer for torrents the user added to qBittorrent by hand. It is
// never polled or searched (kept disabled); it exists only so an adopted
// manual download can hang off a release row, and to label provenance as
// "Manual". Same structural shape as the others so generic IndexerConfig code
// (buildQuery, etc.) keeps compiling.
export type ManualConfig = {
  kind: 'manual';
  queryTemplate: string;
  contentTypes: ContentType[];
  categoryByContentType: Partial<Record<ContentType, string>>;
  pollIntervalSeconds: number;
};

export type MamConfig = {
  kind: 'mam';
  queryTemplate: string;
  contentTypes: ContentType[];
  /** MAM main_cat per content type: audiobook→13, ebook→14, light_novel→14. */
  categoryByContentType: Partial<Record<ContentType, number>>;
  /** mam_id session cookie value (secret). IP/ASN-locked. */
  mamId: string;
  /** gluetun HTTP proxy URL so search/.torrent egress matches the qbt announce IP. */
  proxyUrl: string;
  /** MAM tor[srchIn] fields, default ['title']. */
  searchIn: string[];
  pollIntervalSeconds: number;
};

export type IndexerConfig = NyaaConfig | FilelistConfig | TorznabConfig | ManualConfig | MamConfig;

export type IndexerQuery = {
  q: string;
  category: string | number;
};

export type IndexerResult = {
  guid: string;
  title: string;
  link: string;
  sizeBytes: number;
  seeders: number;
  leechers: number;
  pubDate: Date;
  infoHash: string | null;
  category: string;
  trusted?: boolean;
  remake?: boolean;
  /** MAM: torrent is freeleech (free || fl_vip). */
  freeleech?: boolean;
  /** MAM: torrent is VIP (vip || fl_vip). */
  vip?: boolean;
};
