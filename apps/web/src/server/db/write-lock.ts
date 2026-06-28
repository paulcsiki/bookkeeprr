import { Mutex } from 'async-mutex';

const writeMutex = new Mutex();

export async function withWriteLock<T>(fn: () => T | Promise<T>): Promise<T> {
  return writeMutex.runExclusive(fn);
}
