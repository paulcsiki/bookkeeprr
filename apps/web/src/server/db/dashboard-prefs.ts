import { eq } from 'drizzle-orm';
import { getDb } from './client';
import { dashboardPrefs } from './schema';
import { withWriteLock } from './write-lock';
import {
  mergePrefs,
  validatePrefs,
  type DashboardPrefs,
} from '@/components/dashboard/widget-registry';

export type { DashboardPrefs };

/**
 * The dashboard layout prefs for a user. When the user has no stored row (or the
 * stored blob is stale/corrupt) the canonical default is returned. The stored
 * value is always merged over the default via {@link mergePrefs}, so the result
 * is complete and valid even as the widget set changes over time (unknown ids
 * dropped, newly-added widget ids default to enabled and append to the order).
 */
export async function getDashboardPrefs(userId: number): Promise<DashboardPrefs> {
  const rows = await getDb()
    .select()
    .from(dashboardPrefs)
    .where(eq(dashboardPrefs.userId, userId))
    .limit(1);
  const row = rows[0];
  if (!row) return mergePrefs(null);

  let order: unknown;
  let enabled: unknown;
  try {
    order = JSON.parse(row.orderJson);
  } catch {
    order = undefined;
  }
  try {
    enabled = JSON.parse(row.enabledJson);
  } catch {
    enabled = undefined;
  }
  return mergePrefs({ order, enabled });
}

/**
 * Upsert a user's dashboard prefs. The input is validated against the known
 * widget set (order must be a permutation of all widget ids; enabled must cover
 * every id with booleans). Throws on an invalid payload — callers (the API
 * route) should validate first and surface a 400.
 */
export async function setDashboardPrefs(
  userId: number,
  input: { order: unknown; enabled: unknown },
): Promise<DashboardPrefs> {
  const result = validatePrefs(input);
  if (!result.ok) {
    throw new Error(`invalid dashboard prefs: ${result.error}`);
  }
  const value = result.value;

  return withWriteLock(async () => {
    const orderJson = JSON.stringify(value.order);
    const enabledJson = JSON.stringify(value.enabled);
    await getDb()
      .insert(dashboardPrefs)
      .values({ userId, orderJson, enabledJson, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: dashboardPrefs.userId,
        set: { orderJson, enabledJson, updatedAt: new Date() },
      });
    return value;
  });
}
