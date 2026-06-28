export type RetryPolicy = {
  maxAttempts: number;
};

export type JobHandler<P, R> = (payload: P, jobId: number) => Promise<R>;

export type JobKindDescriptor<P, R> = {
  kind: string;
  handler: JobHandler<P, R>;
  retryPolicy: RetryPolicy;
  timeoutMs: number;
};

export const DEFAULT_RETRY_POLICY: RetryPolicy = { maxAttempts: 3 };
export const DEFAULT_TIMEOUT_MS = 60_000;
