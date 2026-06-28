import { describe, expect, it } from 'vitest';
import { QbtTorrentSchema } from '@/server/integrations/qbittorrent/schemas';

const BASE = {
  hash: 'abc',
  name: 'x',
  state: 'uploading',
  progress: 1,
  category: 'bookkeeprr-manga',
  tags: '',
  save_path: '/x',
  size: 100,
  completed: 100,
};

describe('QbtTorrentSchema — ratio / seeding_time', () => {
  it('parses ratio and seeding_time when present', () => {
    const t = QbtTorrentSchema.parse({ ...BASE, ratio: 2.5, seeding_time: 3600 });
    expect(t.ratio).toBe(2.5);
    expect(t.seeding_time).toBe(3600);
  });

  it('defaults ratio/seeding_time to 0 when missing (older qBit)', () => {
    const t = QbtTorrentSchema.parse(BASE);
    expect(t.ratio).toBe(0);
    expect(t.seeding_time).toBe(0);
  });

  it('tolerates non-numeric ratio/seeding_time (partial response)', () => {
    const t = QbtTorrentSchema.parse({ ...BASE, ratio: null, seeding_time: 'oops' });
    expect(t.ratio).toBe(0);
    expect(t.seeding_time).toBe(0);
  });
});
