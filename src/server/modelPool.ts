/**
 * clic3d-cadam: free model rotation pool.
 *
 * Strategy: 1 OpenRouter account/key, rotate across 10 different FREE
 * models in round-robin. Each `:free` model on OpenRouter has its own
 * rate limit (typically ~20 req/min, ~1000-2000 req/day per model). So 10
 * models in rotation effectively multiply our capacity ~10× without
 * needing multiple accounts.
 *
 * When a model returns 429 / rate-limit / quota error, it is cooled off
 * for 5 min and the next model in the pool takes over.
 *
 * Usage:
 *   const model = pickModel({ needsVision: true });
 *   // After failed call:
 *   reportModelFailure(model.id, error);
 */

type ModelEntry = {
  id: string;
  label: string;
  supportsVision: boolean;
  supportsTools: boolean;
  cooledUntil: number;
  lastError?: string;
};

// 10 free OpenRouter models — order = preference. We try them
// in round-robin starting from `rotation`.
const FREE_MODELS: Omit<ModelEntry, 'cooledUntil' | 'lastError'>[] = [
  // Google AI Studio direct (separate quota from OpenRouter — tried first)
  {
    id: 'google-direct/gemini-2.5-flash-lite:free',
    label: 'Gemini 2.5 Flash-Lite',
    supportsVision: true,
    supportsTools: true,
  },
  {
    id: 'google-direct/gemini-2.5-flash:free',
    label: 'Gemini 2.5 Flash',
    supportsVision: true,
    supportsTools: true,
  },
  {
    id: 'google-direct/gemini-2.5-pro:free',
    label: 'Gemini 2.5 Pro',
    supportsVision: true,
    supportsTools: true,
  },
  // Vision-capable (CADAM sends scene screenshots)
  {
    id: 'google/gemma-4-31b-it:free',
    label: 'Gemma 4 31B',
    supportsVision: true,
    supportsTools: true,
  },
  {
    id: 'moonshotai/kimi-k2.6:free',
    label: 'Kimi K2.6',
    supportsVision: true,
    supportsTools: true,
  },
  {
    id: 'google/gemma-4-26b-a4b-it:free',
    label: 'Gemma 4 26B',
    supportsVision: true,
    supportsTools: true,
  },
  // Text-only fallbacks (used only when caller signals needsVision=false)
  {
    id: 'nvidia/nemotron-3-super-120b-a12b:free',
    label: 'Nemotron 120B',
    supportsVision: false,
    supportsTools: true,
  },
  {
    id: 'openai/gpt-oss-120b:free',
    label: 'GPT-OSS 120B',
    supportsVision: false,
    supportsTools: true,
  },
  {
    id: 'meta-llama/llama-3.3-70b-instruct:free',
    label: 'Llama 3.3 70B',
    supportsVision: false,
    supportsTools: true,
  },
  {
    id: 'qwen/qwen3-coder:free',
    label: 'Qwen3 Coder',
    supportsVision: false,
    supportsTools: true,
  },
];

const COOLOFF_MS = 5 * 60 * 1000;

let pool: ModelEntry[] | null = null;
let rotation = 0;

function ensurePool(): ModelEntry[] {
  if (pool) return pool;
  pool = FREE_MODELS.map((m) => ({ ...m, cooledUntil: 0 }));
  return pool;
}

export function pickModel(
  opts: { needsVision?: boolean; needsTools?: boolean } = {},
): {
  id: string;
  label: string;
} {
  const p = ensurePool();
  const now = Date.now();
  const eligible = (m: ModelEntry) =>
    (opts.needsVision !== true || m.supportsVision) &&
    (opts.needsTools !== true || m.supportsTools);

  // TIER 1 — google-direct/* (independent Google AI Studio quota, multi-key
  // rotation in googlePool). Always tried first, in listed order, before any
  // OpenRouter fallback. Per-key rate-limits are handled by googlePool so the
  // models themselves don't carry cool-off here (see reportModelFailure
  // early-return for google-direct/*). The `rotation` index only governs
  // tier 2.
  for (const m of p) {
    if (!m.id.startsWith('google-direct/')) continue;
    if (m.cooledUntil <= now && eligible(m)) {
      return { id: m.id, label: m.label };
    }
  }

  // TIER 2 — OpenRouter free models. Round-robin starting from `rotation`,
  // skipping cooled and non-eligible. Only reached when all google-direct
  // entries are cooled (rare — google-direct entries are not cooled by
  // reportModelFailure, only by googlePool's per-key cool-off propagating
  // back if every key in the pool is exhausted).
  const tier2 = p
    .map((m, idx) => ({ m, idx }))
    .filter(({ m }) => !m.id.startsWith('google-direct/'));
  for (let i = 0; i < tier2.length; i++) {
    const { m, idx } = tier2[(rotation + i) % tier2.length];
    if (m.cooledUntil <= now && eligible(m)) {
      rotation = (idx + 1) % p.length;
      return { id: m.id, label: m.label };
    }
  }

  // Everyone is cooled or none eligible — fall back to the eligible one
  // that cools off soonest.
  const fallback = p
    .filter(eligible)
    .sort((a, b) => a.cooledUntil - b.cooledUntil)[0];
  if (fallback) return { id: fallback.id, label: fallback.label };
  // Nothing matches the requirements at all — last resort: any model.
  return { id: p[0].id, label: p[0].label };
}

export function reportModelFailure(modelId: string, err: unknown): void {
  const p = ensurePool();
  const entry = p.find((m) => m.id === modelId);
  if (!entry) return;
  // Google-direct models are backed by the multi-key googlePool — when one key
  // is rate-limited, googlePool cools that key but the model itself can still
  // be served by another key on the next request. Cooling the model here would
  // defeat the whole point of multi-key rotation, so skip it.
  if (modelId.startsWith('google-direct/')) return;
  const msg = err instanceof Error ? err.message : String(err);
  const isCooloffSignal =
    /429|rate.?limit|quota|insufficient|exhausted|rate-limited upstream|temporarily/i.test(
      msg,
    );
  if (isCooloffSignal) {
    entry.cooledUntil = Date.now() + COOLOFF_MS;
    entry.lastError = msg.slice(0, 200);
  }
}

export function poolStatus(): {
  total: number;
  available: number;
  visionAvailable: number;
  next: string;
} {
  const p = ensurePool();
  const now = Date.now();
  const avail = p.filter((m) => m.cooledUntil <= now);
  return {
    total: p.length,
    available: avail.length,
    visionAvailable: avail.filter((m) => m.supportsVision).length,
    next: avail[0]?.id ?? p[0].id,
  };
}
