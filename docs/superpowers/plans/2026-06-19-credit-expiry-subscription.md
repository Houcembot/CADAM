# Expiration des crédits (lots) & pass abonnement — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faire expirer les crédits par lot (inscription 30j, pack 24h, pass abo 30j) et ajouter un pass abonnement 7000 crédits / 200 DT / 30 jours, sans casser le système crédits déjà en prod.

**Architecture:** Nouvelle table `cadam_credit_lots` (montant restant + `expires_at` par lot). Les RPC `get_credit_balance` / `consume_credits` sont réécrites (même nom/signature → le code TS cadam ne change pas) pour opérer sur les lots non expirés, consommation du lot expirant le plus tôt en premier. Une nouvelle RPC `grant_credit_lot` (avec expiration) remplace `grant_credits` côté webhook et trigger signup. clic3dprint ajoute le produit abo et passe l'expiration au moment du grant.

**Tech Stack:** Supabase (Postgres/plpgsql, PostgREST), cadam (Vite/TS — inchangé), clic3dprint (Next.js JS), D17 (`lib/d17.js`), `getSupabaseAdmin`/`getDb`.

**Spec:** `docs/superpowers/specs/2026-06-19-credit-expiry-subscription-design.md`

---

## Structure des fichiers

**Supabase (clic3d-cadam) :**

- Create: `supabase/migrations/20260619100000_credit_lots.sql` — table lots, RPC réécrites, trigger, grants, migration data, notify.

**cadam (clic3d-cadam) :** aucun changement de code (RPC noms/signatures inchangés). Vérif `tsc` seulement.

**clic3dprint :**

- Modify: `app/api/db-init/route.js` — 2 colonnes sur `credit_orders`.
- Modify: `app/api/payment/credits/route.js` — produits `cr200` + `sub7000`.
- Modify: `app/api/payment/credits-callback/route.js` — grant via `grant_credit_lot` + expiration.
- Modify: `lib/cadam-credits.js` — `grantCadamCredits` appelle `grant_credit_lot`.
- Modify: `app/recharge/page.js` — liste les 2 produits.
- Modify: `app/creation/ModeToggle.js` — section explicative crédits sous l'iframe.

---

## Phase 1 — Supabase : lots + RPC (fondation)

### Task 1 : Migration lots + RPC réécrites

**Files :**

- Create: `clic3d-cadam/supabase/migrations/20260619100000_credit_lots.sql`

- [ ] **Step 1 : Écrire la migration**

```sql
-- 1) Table des lots de crédits (chaque attribution = 1 lot avec sa date d'expiration)
create table if not exists public.cadam_credit_lots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason in ('signup','pack','subscription','migration')),
  amount_initial integer not null check (amount_initial > 0),
  amount_remaining integer not null check (amount_remaining >= 0),
  expires_at timestamptz not null,
  ref text,
  created_at timestamptz not null default now()
);
create unique index if not exists cadam_credit_lots_reason_ref_uniq
  on public.cadam_credit_lots(reason, ref) where ref is not null;
create index if not exists cadam_credit_lots_user_active
  on public.cadam_credit_lots(user_id, expires_at) where amount_remaining > 0;

alter table public.cadam_credit_lots enable row level security;
create policy "read own lots" on public.cadam_credit_lots
  for select using (auth.uid() = user_id);

-- 2) get_credit_balance : somme des lots NON expirés (même signature -> code TS inchangé)
create or replace function public.get_credit_balance(uid uuid)
returns int language sql security definer as $$
  select coalesce(sum(amount_remaining), 0)::int
  from public.cadam_credit_lots
  where user_id = uid and expires_at > now() and amount_remaining > 0;
$$;

-- 3) grant_credit_lot : crée un lot, idempotent sur (reason, ref). Renvoie le nouveau solde.
create or replace function public.grant_credit_lot(
  uid uuid, p_amount int, p_reason text, p_ref text, p_expires_at timestamptz
) returns int language plpgsql security definer as $$
begin
  if p_amount <= 0 then raise exception 'amount must be positive'; end if;
  if p_ref is not null and exists (
    select 1 from public.cadam_credit_lots where reason = p_reason and ref = p_ref
  ) then
    return public.get_credit_balance(uid);
  end if;
  insert into public.cadam_credit_lots(user_id, reason, amount_initial, amount_remaining, expires_at, ref)
    values (uid, p_reason, p_amount, p_amount, p_expires_at, p_ref);
  return public.get_credit_balance(uid);
end $$;

-- 4) consume_credits : débite les lots expirant le plus tôt d'abord (même signature -> code TS inchangé)
create or replace function public.consume_credits(uid uuid, p_amount int, p_reason text, p_ref text)
returns int language plpgsql security definer as $$
declare remaining int := p_amount; lot record;
begin
  if p_amount <= 0 then raise exception 'amount must be positive'; end if;
  if p_ref is not null and exists (
    select 1 from public.cadam_credit_transactions where reason = p_reason and ref = p_ref
  ) then
    return public.get_credit_balance(uid);
  end if;
  if public.get_credit_balance(uid) < p_amount then
    raise exception 'insufficient_credits';
  end if;
  for lot in
    select id, amount_remaining from public.cadam_credit_lots
    where user_id = uid and expires_at > now() and amount_remaining > 0
    order by expires_at asc
    for update
  loop
    exit when remaining <= 0;
    if lot.amount_remaining >= remaining then
      update public.cadam_credit_lots set amount_remaining = amount_remaining - remaining where id = lot.id;
      remaining := 0;
    else
      remaining := remaining - lot.amount_remaining;
      update public.cadam_credit_lots set amount_remaining = 0 where id = lot.id;
    end if;
  end loop;
  insert into public.cadam_credit_transactions(user_id, delta, reason, ref)
    values (uid, -p_amount, p_reason, p_ref);
  return public.get_credit_balance(uid);
end $$;

-- 5) Trigger signup -> lot de 100 crédits valable 30 jours
create or replace function public.grant_signup_credits()
returns trigger language plpgsql security definer as $$
begin
  perform public.grant_credit_lot(new.user_id, 100, 'signup', new.user_id::text, now() + interval '30 days');
  return new;
end $$;
-- (le trigger trg_grant_signup_credits existe déjà et pointe sur cette fonction)

-- 6) Sécurité : la nouvelle RPC grant_credit_lot = service_role only
--    (get_credit_balance / consume_credits conservent leurs grants via create-or-replace)
revoke execute on function public.grant_credit_lot(uuid,int,text,text,timestamptz)
  from public, anon, authenticated;
grant execute on function public.grant_credit_lot(uuid,int,text,text,timestamptz) to service_role;

-- 7) Migration des soldes existants -> lots 'migration' 30 jours
insert into public.cadam_credit_lots (user_id, reason, amount_initial, amount_remaining, expires_at, ref)
select user_id, 'migration', balance, balance, now() + interval '30 days', user_id::text
from public.cadam_credits where balance > 0
on conflict (reason, ref) where ref is not null do nothing;

-- 8) Recharger le cache PostgREST (nouvelle fonction exposée)
notify pgrst, 'reload schema';
```

- [ ] **Step 2 : Appliquer dans le SQL editor Supabase (prod) — NE PAS appliquer en aveugle, c'est de la prod**
      Coller le bloc, Run. Attendu : `Success. No rows returned`.

- [ ] **Step 3 : Vérifier (remplacer `<uid>` par un vrai user, ex. 80aa82f2-3a49-4890-9645-620559076338)**

```sql
-- migration: l'ancien solde est devenu un lot
select reason, amount_remaining, expires_at from public.cadam_credit_lots where user_id='<uid>';
-- consommation FIFO-expiry + solde
select public.get_credit_balance('<uid>');                                   -- = solde courant
select public.grant_credit_lot('<uid>',200,'pack','t-pack',now()+interval '24 hours'); -- +200
select public.grant_credit_lot('<uid>',200,'pack','t-pack',now()+interval '24 hours'); -- idempotent (inchangé)
select public.consume_credits('<uid>',20,'premium_generation','t-gen1');     -- -20
select public.consume_credits('<uid>',20,'premium_generation','t-gen1');     -- idempotent (inchangé)
-- nettoyage du test
delete from public.cadam_credit_lots where ref='t-pack';
delete from public.cadam_credit_transactions where ref='t-gen1';
```

Expected : le lot pack est débité avant le lot migration s'il expire plus tôt ; grant/consume idempotents.

- [ ] **Step 4 : Commit (le fichier de migration, versionné)**

```bash
cd clic3d-cadam
git add supabase/migrations/20260619100000_credit_lots.sql
git commit -m "feat(credits): lot-based expiring credits + grant_credit_lot RPC"
```

---

## Phase 2 — clic3dprint : produit abo + grant avec expiration

### Task 2 : Colonnes `credit_orders` (reason, ttl_hours)

**Files :**

- Modify: `clic3dprint/app/api/db-init/route.js`

- [ ] **Step 1 : Ajouter 2 ALTER après la création de `credit_orders` (dans le tableau de statements)**

```js
    `ALTER TABLE credit_orders ADD COLUMN IF NOT EXISTS reason TEXT DEFAULT 'pack'`,
    `ALTER TABLE credit_orders ADD COLUMN IF NOT EXISTS ttl_hours INTEGER DEFAULT 24`,
```

- [ ] **Step 2 : Commit**

```bash
cd clic3dprint
git add app/api/db-init/route.js
git commit -m "feat(credits): credit_orders gets reason + ttl_hours"
```

### Task 3 : Produits (pack + pass) à l'init du paiement

**Files :**

- Modify: `clic3dprint/app/api/payment/credits/route.js`

- [ ] **Step 1 : Remplacer le `PACKS` mono-produit par un catalogue + stocker reason/ttl**

```js
const PRODUCTS = {
  cr200: { credits: 200, amountTnd: 20, ttlHours: 24, reason: 'pack' },
  sub7000: {
    credits: 7000,
    amountTnd: 200,
    ttlHours: 24 * 30,
    reason: 'subscription',
  },
};
```

Dans le handler : `const product = PRODUCTS[body.pack];` (au lieu de `PACKS[body.pack]`), et l'INSERT inclut reason + ttl_hours :

```js
await db
  .prepare(
    `INSERT INTO credit_orders (id, email, credits, amount_tnd, konnect_ref, status, reason, ttl_hours, created_at)
     VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, NOW())`,
  )
  .run(
    orderId,
    session.email,
    product.credits,
    product.amountTnd,
    `d17_${paymentId}`,
    product.reason,
    product.ttlHours,
  );
```

(et `description: \`${product.credits} crédits clic3d\``, `amountTnd: product.amountTnd`).

- [ ] **Step 2 : Commit**

```bash
git add app/api/payment/credits/route.js
git commit -m "feat(credits): pack + 30-day subscription products at D17 init"
```

### Task 4 : `grantCadamCredits` -> `grant_credit_lot` (avec expiration)

**Files :**

- Modify: `clic3dprint/lib/cadam-credits.js`

- [ ] **Step 1 : Remplacer l'appel `grant_credits` par `grant_credit_lot`**

```js
// Crédite un LOT (idempotent via ref=orderId). Renvoie le nouveau solde ou null si user introuvable.
export async function grantCadamCredits({
  email,
  amount,
  ref,
  reason,
  ttlHours,
}) {
  const uid = await cadamUserIdByEmail(email);
  if (!uid) return null;
  const sb = getSupabaseAdmin();
  const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000).toISOString();
  const { data, error } = await sb.rpc('grant_credit_lot', {
    uid,
    p_amount: amount,
    p_reason: reason,
    p_ref: ref,
    p_expires_at: expiresAt,
  });
  if (error) throw error;
  return data;
}
```

- [ ] **Step 2 : Commit**

```bash
git add lib/cadam-credits.js
git commit -m "feat(credits): grant an expiring lot instead of a flat balance"
```

### Task 5 : Callback transmet reason + ttl_hours

**Files :**

- Modify: `clic3dprint/app/api/payment/credits-callback/route.js`

- [ ] **Step 1 : À l'appel `grantCadamCredits`, passer reason + ttlHours depuis l'ordre**

```js
const newBalance = await grantCadamCredits({
  email: order.email,
  amount: order.credits,
  ref: orderId,
  reason: order.reason || 'pack',
  ttlHours: order.ttl_hours || 24,
});
```

(Le reste du webhook — vérif serveur-à-serveur sur ref stockée, contrôle montant, grant-avant-flip, idempotence — est INCHANGÉ.)

- [ ] **Step 2 : Commit**

```bash
git add app/api/payment/credits-callback/route.js
git commit -m "feat(credits): callback grants the right lot expiry per product"
```

---

## Phase 3 — UI

### Task 6 : `/recharge` liste les 2 produits

**Files :**

- Modify: `clic3dprint/app/recharge/page.js`

- [ ] **Step 1 : Étendre `PACKS` en 2 entrées**

```js
const PACKS = [
  {
    id: 'cr200',
    credits: 200,
    priceTnd: 20,
    generations: 10,
    validity: '24 h',
  },
  {
    id: 'sub7000',
    credits: 7000,
    priceTnd: 200,
    generations: 350,
    validity: '30 jours',
  },
];
```

Dans le rendu de chaque carte, afficher la validité (ex. sous « ≈ N générations » : `Valable {p.validity}`). Le bouton et le `buy(p.id)` existants fonctionnent tels quels (POST `{pack: p.id}`).

- [ ] **Step 2 : Commit**

```bash
git add app/recharge/page.js
git commit -m "feat(credits): /recharge lists pack + 30-day pass"
```

### Task 7 : Section explicative sous l'iframe IA

**Files :**

- Modify: `clic3dprint/app/creation/ModeToggle.js`

- [ ] **Step 1 : Sous le `<p>` "Service propulsé par IA générative…" (fin du bloc `mode === 'ai'`), ajouter un encart**

```jsx
<div
  style={{
    marginTop: '16px',
    padding: '16px',
    border: '1px solid #e5e7eb',
    borderRadius: '12px',
    background: '#f9fafb',
    fontSize: '0.85rem',
    color: '#555',
    lineHeight: 1.7,
  }}
>
  <strong style={{ color: '#1a3318' }}>Comment marchent les crédits ?</strong>
  <ul style={{ margin: '8px 0 0', paddingLeft: '18px' }}>
    <li>
      Chaque génération premium coûte <strong>20 crédits</strong>.
    </li>
    <li>
      <strong>100 crédits offerts</strong> à l'inscription (valables 30 jours).
    </li>
    <li>
      Pack : <strong>200 crédits — 20 DT</strong> (valables 24 h).
    </li>
    <li>
      Pass : <strong>7000 crédits — 200 DT</strong> (valables 30 jours).
    </li>
    <li>À 0 crédit, la génération est bloquée jusqu'à rachat.</li>
  </ul>
  <a
    href="/recharge"
    style={{
      display: 'inline-block',
      marginTop: '10px',
      color: '#04B32B',
      fontWeight: 700,
    }}
  >
    Recharger des crédits →
  </a>
</div>
```

- [ ] **Step 2 : Commit**

```bash
git add app/creation/ModeToggle.js
git commit -m "feat(credits): explainer block (credits/prices/limits) under the AI window"
```

---

## Phase 4 — Validation bout-en-bout (staging/prod)

- [ ] **Step 1 :** `tsc -b --noEmit` côté cadam = exit 0 (aucun code TS modifié, mais on vérifie).
- [ ] **Step 2 :** Appliquer la migration (Task 1) + relancer `/api/db-init` (Task 2 colonnes) + `notify pgrst`.
- [ ] **Step 3 :** Acheter un pack (D17 sandbox) → lot 24 h créé ; acheter le pass → lot 30 j. Rejouer le callback → solde inchangé (idempotent).
- [ ] **Step 4 :** Générer → débite 20 du lot expirant le plus tôt. Créer un lot `expires_at` passé (SQL) → non compté dans le solde.
- [ ] **Step 5 :** Merge clic3dprint → main (Railway) + promote cadam si besoin (le code cadam n'a pas changé, donc le promote n'est nécessaire que si le spec touchait du TS — ici non ; seule la migration SQL compte).

## Notes / risques

- **`create or replace` préserve les grants** existants → `get_credit_balance`/`consume_credits` restent `service_role` only sans réécrire les grants ; seul `grant_credit_lot` (nouvelle signature) reçoit ses grants explicitement.
- **`notify pgrst`** obligatoire (nouvelle fonction exposée), sinon l'app voit PGRST202.
- L'ancienne RPC `grant_credits` devient morte (plus appelée) — laissée en place, sans risque.
- `consume_credits` verrouille les lots (`for update`) → pas de double-débit concurrent.
- Hors scope (rappel) : crédit closed-loop plateforme, cash-out, récurrent auto.

```

```
