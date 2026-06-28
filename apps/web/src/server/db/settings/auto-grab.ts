import { z } from 'zod';
import { defineSetting } from '../settings';

export const AutoGrabSchema = z.object({
  dryRun: z.boolean(),
});

export type AutoGrabConfig = z.infer<typeof AutoGrabSchema>;

export const DEFAULT_AUTO_GRAB: AutoGrabConfig = {
  dryRun: false,
};

export const autoGrabSetting = defineSetting('auto-grab.config', AutoGrabSchema, DEFAULT_AUTO_GRAB);
