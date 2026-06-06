// src/server/googlePool.ts — Round-robin pool of Google AI Studio API keys.
// Each key = one Google Cloud project = independent free-tier quota
// (1000 req/day Gemini Flash-Lite per project as of 2026).
//
// Configure via env: GOOGLE_API_KEY, GOOGLE_API_KEY_2, GOOGLE_API_KEY_3, GOOGLE_API_KEY_4.
// Only GOOGLE_API_KEY is required (also used by image gen in mesh.ts).
// Additional keys are picked up if set.

import { env } from './env';

const COOLOFF_MS = 5 * 60 * 1000;

type KeyEntry = {
  key: string;
  cooledUntil: number;
  lastError?: string;
};

let pool: KeyEntry[] | null = null;
let rotation = 0;

function ensurePool(): KeyEntry[] {
  if (pool) return pool;
  const keys: string[] = [];
  const primary = env('GOOGLE_API_KEY');
  if (primary) keys.push(primary);
  for (let i = 2; i <= 4; i++) {
    const k = env(`GOOGLE_API_KEY_${i}`);
    if (k) keys.push(k);
  }
  if (keys.length === 0) {
    // Defer the empty-pool diagnosis to pickGoogleApiKey caller — image-gen
    // and chat both call requiredEnv('GOOGLE_API_KEY') elsewhere so module
    // load isn't the place to throw.
    pool = [];
    return pool;
  }
  pool = keys.map((key) => ({ key, cooledUntil: 0 }));
  return pool;
}

export function pickGoogleApiKey(): string | undefined {
  const p = ensurePool();
  if (p.length === 0) return undefined;
  const now = Date.now();
  for (let i = 0; i < p.length; i++) {
    const idx = (rotation + i) % p.length;
    const e = p[idx];
    if (e.cooledUntil <= now) {
      rotation = (idx + 1) % p.length;
      return e.key;
    }
  }
  // All cooled — return the one that cools off soonest.
  const fallback = [...p].sort((a, b) => a.cooledUntil - b.cooledUntil)[0];
  return fallback.key;
}

export function reportGoogleFailure(key: string, err: unknown): void {
  const p = ensurePool();
  const entry = p.find((e) => e.key === key);
  if (!entry) return;
  const msg = err instanceof Error ? err.message : String(err);
  const isCooloffSignal =
    /429|rate.?limit|quota|insufficient|exhausted|resource_exhausted|rate.?limited|temporarily/i.test(
      msg,
    );
  if (isCooloffSignal) {
    entry.cooledUntil = Date.now() + COOLOFF_MS;
    entry.lastError = msg.slice(0, 200);
  }
}

export function googlePoolStatus(): {
  total: number;
  available: number;
} {
  const p = ensurePool();
  const now = Date.now();
  return {
    total: p.length,
    available: p.filter((e) => e.cooledUntil <= now).length,
  };
}
