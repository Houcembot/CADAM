# clic3d — Crédits premium & paiement D17 — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Monétiser le premium (Gemini 3.1 Pro) avec un système de crédits : 100 crédits offerts au signup, 20 crédits/génération, recharge par pack 200 crédits = 20 DT payé en D17.

**Architecture :** Le solde de crédits vit dans le Supabase **cadam** (`cadam_credits` + ledger idempotent + RPC atomiques). cadam gate/débite à la génération et grant au signup. clic3dprint vend les packs via D17 (rails existants) et crédite le Supabase cadam après vérif serveur-à-serveur, en mappant l'utilisateur **par email** (clic3dprint a son propre Postgres `getDb`; cadam a son Supabase auth — liés par email via le SSO).

**Tech Stack :** Supabase (Postgres + RPC SQL), cadam = Vite/React/TS (`src/server/aiChat.ts`), clic3dprint = Next.js (App Router, JS), lib D17 existante (`lib/d17.js`), `getSupabaseAdmin()` / `getDb()`.

**Spec :** `docs/superpowers/specs/2026-06-17-clic3d-credits-payment-design.md`

---

## Structure des fichiers

**Supabase (migrations SQL) — repo clic3d-cadam :**

- Create: `supabase/migrations/<ts>_cadam_credits.sql` — tables `cadam_credits`, `cadam_credit_transactions`, RPC `grant_credits`, `consume_credits`, `get_credit_balance`, trigger signup.

**cadam (Vercel) :**

- Create: `src/server/credits.ts` — wrappers TS `assertCreditsAvailable`, `consumeCredits`, `getBalance` (appellent les RPC).
- Modify: `src/server/aiChat.ts` — remplace le gate quota par le gate crédits (pré-check 402 + déduction onFinish).
- Modify: `src/lib/utils.ts` — `PARAMETRIC_MODELS` premium-only.
- Modify: composant de solde (UI) — afficher le solde + CTA achat.

**clic3dprint (Railway) :**

- Create: `app/api/payment/credits/route.js` — init paiement D17 d'un pack.
- Create: `app/api/payment/credits-callback/route.js` — vérif + grant_credits.
- Create: `lib/cadam-credits.js` — mappe email→cadam user_id + appelle `grant_credits`.
- Create/Modify: page `/credits` — bouton d'achat.
- Modify: `app/creation/ModeToggle.js` — copie « crédits » au lieu de « 10/jour ».

---

## Phase 1 — Supabase : schéma & RPC (fondation)

### Task 1 : Migration tables + RPC crédits

**Files :**

- Create: `supabase/migrations/20260617090000_cadam_credits.sql`

- [ ] **Step 1 : Écrire la migration**

```sql
-- cadam_credits : un solde par utilisateur (auth.users de cadam)
create table if not exists public.cadam_credits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

-- Ledger d'audit + idempotence
create table if not exists public.cadam_credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  delta integer not null,
  reason text not null check (reason in ('signup_grant','pack_purchase','premium_generation')),
  ref text,
  created_at timestamptz not null default now()
);
-- Idempotence : une (reason, ref) ne peut être appliquée qu'une fois (ref non nul)
create unique index if not exists cadam_credit_tx_reason_ref_uniq
  on public.cadam_credit_transactions(reason, ref) where ref is not null;

alter table public.cadam_credits enable row level security;
alter table public.cadam_credit_transactions enable row level security;
-- Lecture de SON solde uniquement ; écritures = service_role/RPC SECURITY DEFINER
create policy "read own balance" on public.cadam_credits
  for select using (auth.uid() = user_id);
create policy "read own tx" on public.cadam_credit_transactions
  for select using (auth.uid() = user_id);

-- grant_credits : +amount, idempotent sur (reason, ref). Renvoie le nouveau solde.
create or replace function public.grant_credits(uid uuid, amount int, p_reason text, p_ref text)
returns int language plpgsql security definer as $$
declare new_balance int;
begin
  if amount <= 0 then raise exception 'amount must be positive'; end if;
  -- Idempotence : si (reason, ref) déjà appliquée, ne rien faire et renvoyer le solde courant
  if p_ref is not null and exists (
    select 1 from public.cadam_credit_transactions where reason = p_reason and ref = p_ref
  ) then
    return coalesce((select balance from public.cadam_credits where user_id = uid), 0);
  end if;
  insert into public.cadam_credits(user_id, balance) values (uid, amount)
    on conflict (user_id) do update set balance = public.cadam_credits.balance + amount, updated_at = now()
    returning balance into new_balance;
  insert into public.cadam_credit_transactions(user_id, delta, reason, ref)
    values (uid, amount, p_reason, p_ref);
  return new_balance;
end $$;

-- consume_credits : -amount si solde suffisant, sinon exception. Renvoie le nouveau solde.
create or replace function public.consume_credits(uid uuid, amount int, p_reason text, p_ref text)
returns int language plpgsql security definer as $$
declare new_balance int;
begin
  if amount <= 0 then raise exception 'amount must be positive'; end if;
  if p_ref is not null and exists (
    select 1 from public.cadam_credit_transactions where reason = p_reason and ref = p_ref
  ) then
    return coalesce((select balance from public.cadam_credits where user_id = uid), 0);
  end if;
  update public.cadam_credits set balance = balance - amount, updated_at = now()
    where user_id = uid and balance >= amount
    returning balance into new_balance;
  if new_balance is null then raise exception 'insufficient_credits'; end if;
  insert into public.cadam_credit_transactions(user_id, delta, reason, ref)
    values (uid, -amount, p_reason, p_ref);
  return new_balance;
end $$;

create or replace function public.get_credit_balance(uid uuid)
returns int language sql security definer as $$
  select coalesce((select balance from public.cadam_credits where user_id = uid), 0);
$$;

-- Signup grant : 100 crédits à la création du profil (idempotent via ref = user_id)
create or replace function public.grant_signup_credits()
returns trigger language plpgsql security definer as $$
begin
  perform public.grant_credits(new.id, 100, 'signup_grant', new.id::text);
  return new;
end $$;

drop trigger if exists trg_grant_signup_credits on public.profiles;
create trigger trg_grant_signup_credits
  after insert on public.profiles
  for each row execute function public.grant_signup_credits();
```

- [ ] **Step 2 : Appliquer & tester manuellement (SQL editor Supabase ou `supabase db push`)**

Run (psql/SQL editor) :

```sql
select public.grant_credits('<uid>',100,'pack_purchase','test-ref-1');  -- => 100
select public.grant_credits('<uid>',200,'pack_purchase','test-ref-1');  -- => 100 (idempotent, no-op)
select public.consume_credits('<uid>',20,'premium_generation','gen-1'); -- => 80
select public.consume_credits('<uid>',1000,'premium_generation','gen-2'); -- ERROR insufficient_credits
```

Expected: les valeurs ci-dessus ; la 2e ligne ne double-crédite pas ; la dernière lève `insufficient_credits`.

- [ ] **Step 3 : Commit**

```bash
git add supabase/migrations/20260617090000_cadam_credits.sql
git commit -m "feat(credits): supabase schema + atomic grant/consume RPCs"
```

---

## Phase 2 — cadam : gate crédits à la génération

### Task 2 : Wrappers TS crédits

**Files :**

- Create: `src/server/credits.ts`

- [ ] **Step 1 : Implémenter les wrappers**

```ts
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

/** Deduct on success path. `ref` = message id for idempotency. */
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
```

- [ ] **Step 2 : Typecheck**
      Run: `npx tsc -b --noEmit`
      Expected: exit 0.

- [ ] **Step 3 : Commit**

```bash
git add src/server/credits.ts
git commit -m "feat(credits): TS wrappers over grant/consume RPCs"
```

### Task 3 : Brancher le gate dans aiChat.ts

**Files :**

- Modify: `src/server/aiChat.ts` (le bloc pré-check quota ~ligne 853, et le bloc onFinish ~ligne 1226)

- [ ] **Step 1 : Remplacer le pré-check quota par le pré-check crédits**

Dans le `try/catch` du pré-check (actuellement `assertQuotaAvailable`), remplacer par :

```ts
try {
  const balance = await assertCreditsAvailable(user.id, supabaseClient);
  console.log(`[clic3d-credits] precheck user=${user.id} balance=${balance}`);
} catch (error) {
  if (error instanceof InsufficientCreditsError) {
    return jsonResponse(
      {
        error: 'insufficient_credits',
        balance: error.balance,
        needed: error.needed,
      },
      402,
    );
  }
  logError(error, {
    functionName: 'ai-chat',
    statusCode: 500,
    userId: user.id,
    conversationId: conversation.id,
    additionalContext: { operation: 'credits_precheck' },
  });
  return jsonResponse({ error: 'Credits service unavailable' }, 503);
}
```

Ajouter l'import : `import { assertCreditsAvailable, consumeCredits, InsufficientCreditsError } from './credits';`

- [ ] **Step 2 : Remplacer la déduction onFinish**

Dans `onFinish`, remplacer le bloc `incrementQuota` (gaté `!isContinuation && generatedSomething`) par :

```ts
if (!isContinuation && generatedSomething) {
  try {
    const balance = await consumeCredits(
      user.id,
      supabaseClient,
      responseMessage.id,
    );
    console.log(
      `[clic3d-credits] consumed user=${user.id} -20 balance=${balance}`,
    );
  } catch (creditErr) {
    logError(creditErr, {
      functionName: 'ai-chat',
      statusCode: 500,
      userId: user.id,
      conversationId: conversation.id,
      additionalContext: { operation: 'credits_consume' },
    });
  }
}
```

> `responseMessage.id` = clé d'idempotence (1 message = 1 déduction). `generatedSomething` est déjà défini plus haut (cf. fix sur-comptage).

- [ ] **Step 3 : Typecheck**
      Run: `npx tsc -b --noEmit`
      Expected: exit 0.

- [ ] **Step 4 : Commit**

```bash
git add src/server/aiChat.ts
git commit -m "feat(credits): gate generations on credit balance (402 + deduct on success)"
```

### Task 4 : Sélecteur premium-only

**Files :**

- Modify: `src/lib/utils.ts` (`PARAMETRIC_MODELS`)

- [ ] **Step 1 : Ne garder que les entrées premium (Gemini 3.1 Pro défaut), retirer les `:free`.**
      Garder : `google/gemini-3.1-pro-preview` (défaut), `anthropic/claude-sonnet-4.5`. Supprimer Flash/Gemma/Nemotron/Kimi/Auto.

- [ ] **Step 2 : Typecheck** — `npx tsc -b --noEmit` → exit 0.
- [ ] **Step 3 : Commit**

```bash
git add src/lib/utils.ts
git commit -m "feat(credits): premium-only model selector (Gemini 3.1 Pro default)"
```

---

## Phase 3 — clic3dprint : achat de pack D17

### Task 5 : Mapping email→cadam user + grant

**Files :**

- Create: `lib/cadam-credits.js`

- [ ] **Step 1 : Implémenter**

```js
// lib/cadam-credits.js — crédite le solde cadam après paiement vérifié.
import { getSupabaseAdmin } from './supabase-admin';

// Mappe l'email (identité clic3dprint) -> user_id Supabase cadam via la table profiles.
async function cadamUserIdByEmail(email) {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle();
  if (error) throw error;
  return data?.id || null;
}

// Crédite `amount` à l'utilisateur (idempotent via ref = orderId). Renvoie le nouveau solde ou null si user introuvable.
export async function grantCadamCredits({ email, amount, ref }) {
  const uid = await cadamUserIdByEmail(email);
  if (!uid) return null;
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.rpc('grant_credits', {
    uid,
    amount,
    p_reason: 'pack_purchase',
    p_ref: ref,
  });
  if (error) throw error;
  return data;
}
```

- [ ] **Step 2 : Commit**

```bash
git add lib/cadam-credits.js
git commit -m "feat(credits): map clic3dprint email to cadam user and grant credits"
```

### Task 6 : Route d'init paiement pack

**Files :**

- Create: `app/api/payment/credits/route.js`

- [ ] **Step 1 : Implémenter (réutilise `initD17Payment` + `getDb` + table `orders`)**

```js
import { NextResponse } from 'next/server';
import { getSession } from '../../../../lib/auth';
import { getDb } from '../../../../lib/db';
import { initD17Payment } from '../../../../lib/d17';

const PACKS = { cr200: { credits: 200, amountTnd: 20 } };

export async function POST(req) {
  const session = await getSession();
  if (!session?.email)
    return NextResponse.json({ error: 'Connexion requise' }, { status: 401 });
  let body;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const pack = PACKS[body.pack];
  if (!pack)
    return NextResponse.json({ error: 'Pack invalide' }, { status: 400 });

  const db = getDb();
  const orderId = `cr_${crypto.randomUUID()}`;
  const base = process.env.NEXT_PUBLIC_BASE_URL || 'https://clic3d.tn';
  const { paymentUrl, paymentId } = await initD17Payment({
    amountTnd: pack.amountTnd,
    orderId,
    customerEmail: session.email,
    description: `${pack.credits} crédits clic3d`,
    successUrl: `${base}/api/payment/credits-callback?order_id=${orderId}`,
    failUrl: `${base}/credits?status=fail`,
  });
  await db
    .prepare(
      `INSERT INTO credit_orders (id, email, credits, amount_tnd, konnect_ref, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'pending', NOW())`,
    )
    .run(
      orderId,
      session.email,
      pack.credits,
      pack.amountTnd,
      `d17_${paymentId}`,
    );

  return NextResponse.json({ paymentUrl });
}
```

> Prérequis migration Postgres clic3dprint : table `credit_orders(id pk, email, credits int, amount_tnd numeric, konnect_ref text, status text default 'pending', paid_at timestamptz, created_at timestamptz)`. Ajouter cette migration dans le mécanisme `db-init` existant.

- [ ] **Step 2 : Commit**

```bash
git add app/api/payment/credits/route.js
git commit -m "feat(credits): D17 init route for credit packs"
```

### Task 7 : Callback — vérif serveur-à-serveur + crédit

**Files :**

- Create: `app/api/payment/credits-callback/route.js`

- [ ] **Step 1 : Implémenter (calque le pattern sécurisé de `d17-callback`)**

```js
import { NextResponse } from 'next/server';
import { getDb } from '../../../../lib/db';
import { verifyD17Payment } from '../../../../lib/d17';
import { grantCadamCredits } from '../../../../lib/cadam-credits';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const orderId = searchParams.get('order_id');
  const base = process.env.NEXT_PUBLIC_BASE_URL || 'https://clic3d.tn';
  if (!orderId) return NextResponse.redirect(`${base}/credits?status=invalid`);

  const db = getDb();
  const order = await db
    .prepare('SELECT * FROM credit_orders WHERE id = ?')
    .get(orderId);
  if (!order) return NextResponse.redirect(`${base}/credits?status=not_found`);
  if (order.status === 'paid')
    return NextResponse.redirect(
      `${base}/creation?mode=ai#generation-ia&status=success`,
    );

  // Sécurité : on vérifie la ref STOCKÉE à l'init (jamais un id de la query string).
  const ref = String(order.konnect_ref || '').replace(/^d17_/, '');
  const { paid, amountTnd } = await verifyD17Payment(ref);
  if (!paid) return NextResponse.redirect(`${base}/credits?status=fail`);

  // Le montant payé doit correspondre.
  if (
    amountTnd != null &&
    Math.abs(amountTnd - Number(order.amount_tnd)) > 0.01
  ) {
    console.error('[credits] montant D17 incohérent', {
      orderId,
      expected: order.amount_tnd,
      amountTnd,
    });
    return NextResponse.redirect(`${base}/credits?status=fail`);
  }

  // Idempotence : flip pending->paid une seule fois.
  const upd = await db
    .prepare(
      `UPDATE credit_orders SET status='paid', paid_at=NOW() WHERE id=? AND status!='paid'`,
    )
    .run(order.id);
  if (upd?.changes === 0 || upd?.rowCount === 0) {
    return NextResponse.redirect(
      `${base}/creation?mode=ai#generation-ia&status=success`,
    );
  }

  // Crédite le Supabase cadam (idempotent via ref=orderId côté grant_credits aussi).
  const newBalance = await grantCadamCredits({
    email: order.email,
    amount: order.credits,
    ref: orderId,
  });
  if (newBalance == null) {
    console.error('[credits] cadam user introuvable pour', order.email);
  }
  return NextResponse.redirect(
    `${base}/creation?mode=ai#generation-ia&status=success`,
  );
}
```

- [ ] **Step 2 : Commit**

```bash
git add app/api/payment/credits-callback/route.js
git commit -m "feat(credits): D17 callback verifies payment and grants cadam credits"
```

---

## Phase 4 — UI

### Task 8 : Page /credits (achat)

**Files :**

- Create/Modify: page `app/credits/page.js` (bouton « 200 crédits — 20 DT » → `POST /api/payment/credits {pack:'cr200'}` → redirige vers `paymentUrl`).

- [ ] **Step 1 :** bouton qui `fetch('/api/payment/credits', {method:'POST', body: JSON.stringify({pack:'cr200'})})` puis `window.location = paymentUrl`.
- [ ] **Step 2 : Commit** — `git commit -m "feat(credits): /credits purchase page"`

### Task 9 : Solde + « crédits insuffisants » (cadam) + copie ModeToggle

**Files :**

- Modify: composant de solde cadam (raccordé à `get_credit_balance`) ; gestion du `402 insufficient_credits` → CTA « Acheter des crédits » (postMessage parent ouvrant `/credits`).
- Modify: `clic3dprint/app/creation/ModeToggle.js:156` — remplacer « Service gratuit, limite 10 générations/jour/compte » par « Premium — 100 crédits offerts, puis packs ».

- [ ] **Step 1 :** afficher le solde via `get_credit_balance`.
- [ ] **Step 2 :** intercepter `402` côté client → afficher CTA achat.
- [ ] **Step 3 :** MAJ copie ModeToggle.
- [ ] **Step 4 : Commit** — `git commit -m "feat(credits): balance display, insufficient-credits CTA, updated copy"`

---

## Phase 5 — Validation bout-en-bout

- [ ] **Step 1 :** En staging, nouvel utilisateur → solde 100. 5 générations → solde 0. 6e → 402 + CTA.
- [ ] **Step 2 :** Acheter pack 200 (D17 sandbox) → callback → solde 200. Rejouer le callback → solde reste 200 (idempotent).
- [ ] **Step 3 :** Génération échouée (compile fail) → pas de débit.
- [ ] **Step 4 :** Promote prod Vercel (cadam) + push main (clic3dprint Railway).

---

## Notes / risques

- **Vérifier** que `getSupabaseAdmin()` (clic3dprint) pointe sur le Supabase cadam et que `profiles` a une colonne `email` (sinon mapper via `auth.admin.listUsers` paginé). À confirmer en Task 5.
- **Devise D17** : `D17_AMOUNT_UNIT` (millimes vs dinars) déjà géré par `lib/d17.js` — pas de conversion manuelle.
- **Sécurité paiement** : on ne crédite QUE sur `verifyD17Payment(ref_stockée)` + contrôle du montant + flip d'état idempotent — calqué sur le `d17-callback` existant.
- **Double idempotence** : flip `credit_orders` (clic3dprint) ET `(reason, ref)` unique (Supabase) — un rejeu ne crédite jamais deux fois.
- **Hors scope** : abonnement récurrent, Flouci, logo, prompt caching.
