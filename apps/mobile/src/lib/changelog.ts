import data from '@/../assets/changelog.json';

export type ChangeKind = 'feat' | 'fix' | 'perf' | 'break';

export interface ChangeSection {
  kind: ChangeKind;
  label: string;
  items: string[];
}

export interface VersionEntry {
  version: string;
  date: string;
  summary: string;
  sections: ChangeSection[];
}

export interface ChangelogData {
  versions: VersionEntry[];
}

export function loadChangelog(): ChangelogData {
  return data as ChangelogData;
}

export function getVersionEntry(version: string): VersionEntry | undefined {
  return loadChangelog().versions.find((v) => v.version === version);
}

export function hasVersion(version: string): boolean {
  return getVersionEntry(version) !== undefined;
}
