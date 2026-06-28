import { z } from 'zod';

export const LogFileInfo = z.object({ name: z.string(), sizeBytes: z.number(), mtime: z.number() });
export type LogFileInfo = z.infer<typeof LogFileInfo>;

export const LogFilesResponse = z.object({ files: z.array(LogFileInfo) });
export type LogFilesResponse = z.infer<typeof LogFilesResponse>;

export const LogTail = z.object({ lines: z.array(z.string()), totalBytes: z.number(), hasMore: z.boolean(), nextBefore: z.number() });
export type LogTail = z.infer<typeof LogTail>;
