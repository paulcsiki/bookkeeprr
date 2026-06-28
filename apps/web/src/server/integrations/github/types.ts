export type GhRelease = {
  tagName: string;
  name: string | null;
  body: string | null;
  htmlUrl: string;
  publishedAt: string | null;
  prerelease: boolean;
  draft: boolean;
};

export type GitHubErrorCode = 'http' | 'rate-limited' | 'parse';
