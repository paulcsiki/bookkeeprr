import { z } from 'zod';
import { defineSetting } from '../settings';

export const firstRunCompleteSetting = defineSetting('first-run.complete', z.boolean(), false);
