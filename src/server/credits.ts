import type { SupabaseClient } from '@supabase/supabase-js';

export const PREMIUM_COST = 20;

export class InsufficientCreditsError extends Error {
  balance: number;
  needed: number;
  constructor(balance: number, needed: number) {
    super(`insufficient_credits (${balance}/${needed})`);
    this.name = 'InsufficientCreditsError';
    this.balance = balance;
    this.needed = needed;
  }
}

export async function getBalance(
  userId: string,
  sb: SupabaseClient,
): Promise<number> {
  const { data, error } = await sb.rpc('get_credit_balance', { uid: userId });
  if (error) throw error;
  return (data as number) ?? 0;
}

/** Read-only pre-check. Throws InsufficientCreditsError when balance < PREMIUM_COST. */
export async function assertCreditsAvailable(
  userId: string,
  sb: SupabaseClient,
): Promise<number> {
  const balance = await getBalance(userId, sb);
  if (balance < PREMIUM_COST)
    throw new InsufficientCreditsError(balance, PREMIUM_COST);
  return balance;
}

/** Deduct on success path. `ref` = message id for idempotency. Returns new balance. */
export async function consumeCredits(
  userId: string,
  sb: SupabaseClient,
  ref: string,
): Promise<number> {
  const { data, error } = await sb.rpc('consume_credits', {
    uid: userId,
    amount: PREMIUM_COST,
    p_reason: 'premium_generation',
    p_ref: ref,
  });
  if (error) throw error;
  return (data as number) ?? 0;
}
