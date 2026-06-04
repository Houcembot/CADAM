/**
 * OpenRouter key rotation pool (clic3d-cadam).
 *
 * Reads 1-N OpenRouter keys from env (OPENROUTER_API_KEY,
 * OPENROUTER_API_KEY_2, OPENROUTER_API_KEY_3, ...), rotates them
 * round-robin with sticky cool-off on 429/quota errors.
 *
 * Why this exists:
 * - Multiple concurrent clic3d users hitting CADAM share the same
 *   OpenRouter quota when there's only one key.
 * - When one key hits 429 (rate limit) or runs out of credit,
 *   we mark it cool-off for 5 min and route to the next.
 *
 * Usage:
 *   const key = pickOpenRouterKey();
 *   // After a failed call:
 *   reportOpenRouterFailure(key, error);
 */

const COOLOFF_MS = 5 * 60 * 1000; // 5 min cool-off on quota / rate limit

type KeyEntry = {
  apiKey: string;
  cooledUntil: number; // ms epoch
  lastError?: string;
};

let pool: KeyEntry[] | null = null;
let rotation = 0;

function buildPool(): KeyEntry[] {
  // clic3d-cadam: single OpenRouter key (1 account suffices because we
  // rotate across 10 free MODELS instead — see modelPool.ts).
  // Optional OPENROUTER_API_KEY_2..4 still supported for resilience if needed.
  const keys: string[] = [];
  for (let i = 1; i <= 4; i++) {
    const name = i === 1 ? 'OPENROUTER_API_KEY' : `OPENROUTER_API_KEY_${i}`;
    const v = process.env[name];
    if (v && v.length > 10) keys.push(v);
  }
  if (keys.length === 0) {
    throw new Error('No OPENROUTER_API_KEY configured');
  }
  return keys.map((apiKey) => ({ apiKey, cooledUntil: 0 }));
}

export function pickOpenRouterKey(): string {
  if (!pool) pool = buildPool();
  const now = Date.now();
  // Try each key, skipping cooled ones.
  for (let i = 0; i < pool.length; i++) {
    const idx = (rotation + i) % pool.length;
    if (pool[idx].cooledUntil <= now) {
      rotation = (idx + 1) % pool.length;
      return pool[idx].apiKey;
    }
  }
  // All cooled — fall back to the one that cools off soonest.
  pool.sort((a, b) => a.cooledUntil - b.cooledUntil);
  return pool[0].apiKey;
}

export function reportOpenRouterFailure(apiKey: string, err: unknown): void {
  if (!pool) return;
  const entry = pool.find((p) => p.apiKey === apiKey);
  if (!entry) return;
  const msg = err instanceof Error ? err.message : String(err);
  // Cool off only on quota/rate-limit signals
  const isQuota = /429|rate.?limit|quota|insufficient|exhausted/i.test(msg);
  if (isQuota) {
    entry.cooledUntil = Date.now() + COOLOFF_MS;
    entry.lastError = msg.slice(0, 200);
  }
}

export function poolStatus(): { total: number; available: number; rotation: number } {
  if (!pool) pool = buildPool();
  const now = Date.now();
  const available = pool.filter((p) => p.cooledUntil <= now).length;
  return { total: pool.length, available, rotation };
}
