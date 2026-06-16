/**
 * clic3d-cadam: daily generation quota per user.
 *
 * - DAILY_LIMIT is currently UNLIMITED (Infinity) — the per-day cap was
 *   removed 2026-06-16 at the owner's request. `assertQuotaAvailable`
 *   therefore never throws. We deliberately ignore the CLIC3D_DAILY_LIMIT
 *   env var so a stale value (e.g. an old `=10` set in Vercel) can't
 *   silently re-impose a cap. To re-enable a cap, set DAILY_LIMIT back to
 *   `Number(process.env.CLIC3D_DAILY_LIMIT ?? <n>)`.
 * - Pre-call (before LLM): `assertQuotaAvailable(userId, supabase)` — read-only
 *   check; throws QuotaExceededError when the user is at the cap. Does NOT
 *   increment, so failed/errored generations do not burn the user's quota.
 * - Post-call (in streamText.onFinish, only on success): `incrementQuota(
 *   userId, supabase)` — atomic +1 via the increment_cadam_daily_usage RPC.
 *   Kept as cheap per-user/day telemetry even while the cap is off.
 *
 * Storage: public.cadam_daily_usage table + increment_cadam_daily_usage RPC.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export class QuotaExceededError extends Error {
  count: number;
  limit: number;
  constructor(count: number, limit: number) {
    super(
      `Daily generation limit reached (${count}/${limit}). Reset tomorrow at 00:00 UTC.`,
    );
    this.name = 'QuotaExceededError';
    this.count = count;
    this.limit = limit;
  }
}

// Cap removed 2026-06-16: Infinity means `current >= DAILY_LIMIT` is never
// true, so `assertQuotaAvailable` never throws and no user is ever blocked.
// Env-independent on purpose (see file header).
export const DAILY_LIMIT = Number.POSITIVE_INFINITY;

/**
 * Read-only pre-call gate. Throws QuotaExceededError when the user has
 * already hit DAILY_LIMIT for today (UTC). Does NOT mutate state — pair
 * with `incrementQuota` on the success path so failed generations don't
 * count against the cap.
 */
export async function assertQuotaAvailable(
  userId: string,
  supabase: SupabaseClient,
): Promise<{ count: number; limit: number; remaining: number }> {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('cadam_daily_usage')
    .select('generation_count')
    .eq('user_id', userId)
    .eq('date', today)
    .maybeSingle();
  if (error && error.code !== 'PGRST116') throw error;
  const current = data?.generation_count ?? 0;
  if (current >= DAILY_LIMIT) {
    throw new QuotaExceededError(current, DAILY_LIMIT);
  }
  return {
    count: current,
    limit: DAILY_LIMIT,
    remaining: Math.max(0, DAILY_LIMIT - current),
  };
}

/**
 * Post-call increment. Call only from the success path (e.g.
 * streamText.onFinish) so failed generations don't consume the cap.
 * Returns the new count after increment.
 */
export async function incrementQuota(
  userId: string,
  supabase: SupabaseClient,
): Promise<{ count: number; limit: number; remaining: number }> {
  const { data: newCount, error } = await supabase.rpc(
    'increment_cadam_daily_usage',
    { uid: userId },
  );
  if (error) throw error;
  const count = (newCount as number) ?? 0;
  return {
    count,
    limit: DAILY_LIMIT,
    remaining: Math.max(0, DAILY_LIMIT - count),
  };
}

/**
 * @deprecated Use `assertQuotaAvailable` (pre-call) +
 * `incrementQuota` (post-success) instead. This combined helper still
 * burns the quota even when the downstream LLM call fails. Kept as a
 * thin wrapper so any straggler caller keeps compiling during the
 * transition.
 */
export async function checkAndIncrementQuota(
  userId: string,
  supabase: SupabaseClient,
): Promise<{ count: number; limit: number; remaining: number }> {
  await assertQuotaAvailable(userId, supabase);
  return incrementQuota(userId, supabase);
}

export async function getRemaining(
  userId: string,
  supabase: SupabaseClient,
): Promise<{ count: number; limit: number; remaining: number }> {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from('cadam_daily_usage')
    .select('generation_count')
    .eq('user_id', userId)
    .eq('date', today)
    .maybeSingle();
  const count = data?.generation_count ?? 0;
  return {
    count,
    limit: DAILY_LIMIT,
    remaining: Math.max(0, DAILY_LIMIT - count),
  };
}
