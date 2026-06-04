/**
 * clic3d-cadam: daily generation quota per user.
 *
 * - DAILY_LIMIT comes from env CLIC3D_DAILY_LIMIT (default 10).
 * - Before each AI generation, call `checkAndIncrementQuota(userId, supabase)`.
 * - Throws QuotaExceededError when the user is over the daily cap.
 *
 * Storage: public.cadam_daily_usage table + increment_cadam_daily_usage RPC.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export class QuotaExceededError extends Error {
  count: number;
  limit: number;
  constructor(count: number, limit: number) {
    super(`Daily generation limit reached (${count}/${limit}). Reset tomorrow at 00:00 UTC.`);
    this.name = 'QuotaExceededError';
    this.count = count;
    this.limit = limit;
  }
}

const DAILY_LIMIT = Number(process.env.CLIC3D_DAILY_LIMIT ?? 10);

export async function checkAndIncrementQuota(
  userId: string,
  supabase: SupabaseClient,
): Promise<{ count: number; limit: number; remaining: number }> {
  // 1. Check current count
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

  // 2. Atomically increment
  const { data: newCount, error: rpcError } = await supabase.rpc(
    'increment_cadam_daily_usage',
    { uid: userId },
  );
  if (rpcError) throw rpcError;

  const count = (newCount as number) ?? current + 1;
  return { count, limit: DAILY_LIMIT, remaining: Math.max(0, DAILY_LIMIT - count) };
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
  return { count, limit: DAILY_LIMIT, remaining: Math.max(0, DAILY_LIMIT - count) };
}
