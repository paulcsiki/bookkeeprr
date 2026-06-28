import { z } from 'zod';

export const WidgetId = z.enum([
  'continue',
  'personal',
  'goals',
  'leaderboard',
  'format',
  'feed',
  'releases',
  'server',
  'recent',
]);
export type WidgetId = z.infer<typeof WidgetId>;

export const DashboardPrefs = z.object({
  order: z.array(WidgetId),
  enabled: z.record(z.string(), z.boolean()),
});
export type DashboardPrefs = z.infer<typeof DashboardPrefs>;
