import { claimNextJob, recordJobError, recordJobResult } from '../db/jobs';
import type { JobKindDescriptor } from './types';

export type RunOnceResult = 'ran' | 'idle';

export async function runOnce<P, R>(descriptor: JobKindDescriptor<P, R>): Promise<RunOnceResult> {
  const claimed = await claimNextJob(descriptor.kind);
  if (!claimed) return 'idle';

  const payload = JSON.parse(claimed.payloadJson) as P;

  try {
    const result = await withTimeout(descriptor.handler(payload, claimed.id), descriptor.timeoutMs);
    await recordJobResult(claimed.id, result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordJobError(claimed.id, message, descriptor.retryPolicy);
  }

  return 'ran';
}

export async function runUntilIdle<P, R>(descriptor: JobKindDescriptor<P, R>): Promise<number> {
  let ran = 0;
  while (true) {
    const result = await runOnce(descriptor);
    if (result === 'idle') return ran;
    ran++;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`job timed out after ${ms}ms`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
