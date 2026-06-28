/**
 * Thrown by `importDownload` when the content health-check rejects a release.
 *
 * The import is aborted BEFORE any file is moved or any `library_files` row is
 * inserted, so nothing lands in the library. The release has already been
 * blacklisted (`markReleaseRejected`) and an audit event recorded by the time
 * this is thrown. The import job handler surfaces `message` as the download
 * error + failure notification, so the message is a human-readable reason.
 */
export class HealthCheckError extends Error {
  readonly reason: string;
  readonly releaseId: number;
  readonly failures: { name: string; reason: string }[];

  constructor(reason: string, releaseId: number, failures: { name: string; reason: string }[]) {
    const detail = failures.map((f) => `${f.name} (${f.reason})`).join(', ');
    super(`health check rejected release: ${reason}${detail ? ` — ${detail}` : ''}`);
    this.name = 'HealthCheckError';
    this.reason = reason;
    this.releaseId = releaseId;
    this.failures = failures;
  }
}
