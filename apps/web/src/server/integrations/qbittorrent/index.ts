export {
  QbittorrentError,
  testConnection,
  addTorrent,
  listTorrentsInCategory,
  getTorrentFiles,
  pauseTorrent,
  resumeTorrent,
  deleteTorrent,
  pauseTorrentsByCategory,
  __setQbtFetcherForTests,
  __resetQbtForTests,
} from './client';
export type { AddTorrentInput } from './client';
export type { QbtTorrent, QbtFile } from './schemas';
