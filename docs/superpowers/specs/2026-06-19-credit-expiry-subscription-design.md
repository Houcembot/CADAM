# clic3d — Expiration des crédits (par lots) & pass abonnement — Design

**Date :** 2026-06-19
**Repos :** `clic3d-cadam` (Supabase + gate) + `clic3dprint` (paiement + UI)
**Statut :** spec à valider avant le plan d'implémentation
**Suit :** `2026-06-17-clic3d-credits-payment-design.md` (système crédits déjà en prod)

---

## 1. Objectif

Faire **expirer les crédits par lot** et ajouter un **pass abonnement 30 jours**. Aujourd'hui
`cadam_credits` est un **solde unique** (un entier) sans expiration — on passe à un **modèle par
lots** : chaque attribution de crédits = un lot avec sa propre date d'expiration. Les crédits et
leurs durées sont **cumulables** (plusieurs lots coexistent).

## 2. Décisions actées

| Source de crédits            | Crédits        | Prix    | Expiration   | `reason`       |
| ---------------------------- | -------------- | ------- | ------------ | -------------- |
| Inscription                  | 100            | gratuit | **30 jours** | `signup`       |
| Pack                         | 200            | 20 DT   | **24 h**     | `pack`         |
| Pass abonnement              | 7000           | 200 DT  | **30 jours** | `subscription` |
| Migration (soldes existants) | = solde actuel | —       | **30 jours** | `migration`    |

- 1 génération premium = **20 crédits** (inchangé).
- **Consommation : lot qui expire le plus tôt en premier** (l'utilisateur perd le moins possible).
- **Cumul** : chaque achat = un lot indépendant (pas de remplacement). Re-acheter = nouveau lot.
  Un pack (24 h) et un abo (30 j) peuvent coexister.
- **Pass abonnement = one-shot** (1 paiement D17 → 7000 crédits valables 30 j ; l'utilisateur
  rachète à la main). **Pas** de prélèvement récurrent (hors scope, D17 ne le gère pas).
- **Solde affiché** = somme des crédits **non expirés** uniquement.

## 3. Données (Supabase cadam)

### Nouvelle table `cadam_credit_lots`

| colonne            | type                                                   | note                                           |
| ------------------ | ------------------------------------------------------ | ---------------------------------------------- |
| `id`               | uuid PK (`gen_random_uuid()`)                          |                                                |
| `user_id`          | uuid (FK `auth.users`)                                 |                                                |
| `reason`           | text `in ('signup','pack','subscription','migration')` |                                                |
| `amount_initial`   | int `> 0`                                              | crédits du lot à la création                   |
| `amount_remaining` | int `>= 0`                                             | crédits restants du lot                        |
| `expires_at`       | timestamptz                                            | date d'expiration du lot                       |
| `ref`              | text null                                              | id paiement / commande — **clé d'idempotence** |
| `created_at`       | timestamptz default now()                              |                                                |

```sql
-- idempotence : un lot (reason, ref) n'est créé qu'une fois
create unique index cadam_credit_lots_reason_ref_uniq
  on public.cadam_credit_lots(reason, ref) where ref is not null;
-- accès rapide solde/consommation
create index cadam_credit_lots_user_active
  on public.cadam_credit_lots(user_id, expires_at) where amount_remaining > 0;
```

### `cadam_credit_transactions` (conservée — idempotence des CONSOMMATIONS uniquement)

Inchangée. Ne sert plus qu'à l'idempotence/audit de `consume_credits` (unique `(reason, ref)` déjà
en place : `reason='premium_generation'`, `ref=message_id`). Les **attributions (grants) ne sont
PAS réécrites ici** — elles sont tracées par la table `cadam_credit_lots` (qui a son propre
idempotence `(reason, ref)`). Ça évite aussi de violer le CHECK existant de cette table (qui
n'autorise que `signup_grant/pack_purchase/premium_generation`).

### `cadam_credits` (ancienne table à solde unique)

**Dépréciée** après migration des données vers les lots. Plus lue/écrite par le code. On ne la
`DROP` pas tout de suite (sécurité), mais plus aucune RPC ne la touche.

## 4. RPC (toutes `SECURITY DEFINER`, `service_role` only — cf. lockdown existant)

### `get_credit_balance(uid uuid) returns int`

```sql
select coalesce(sum(amount_remaining), 0)
from public.cadam_credit_lots
where user_id = uid and expires_at > now() and amount_remaining > 0;
```

### `grant_credit_lot(uid uuid, p_amount int, p_reason text, p_ref text, p_expires_at timestamptz) returns int`

- Idempotent : si un lot `(p_reason, p_ref)` existe déjà (`p_ref` non nul) → ne rien faire,
  renvoyer le solde courant.
- Sinon `insert` un lot `(uid, p_reason, p_amount, p_amount, p_expires_at, p_ref)`. (Pas d'écriture
  dans `cadam_credit_transactions` — le lot EST la trace du grant.)
- Renvoie le nouveau solde (`get_credit_balance`).

### `consume_credits(uid uuid, p_amount int, p_reason text, p_ref text) returns int`

- Idempotent : si `(p_reason, p_ref)` déjà dans `cadam_credit_transactions` → renvoyer le solde.
- Vérifier `get_credit_balance(uid) >= p_amount`, sinon `raise exception 'insufficient_credits'`.
- **Débiter en boucle, lots triés par `expires_at` croissant** (les plus proches de l'expiration
  d'abord), `expires_at > now()`, `amount_remaining > 0` : décrémenter chaque lot jusqu'à couvrir
  `p_amount`.
- Insérer `cadam_credit_transactions(-p_amount, p_reason, p_ref)`.
- Renvoyer le nouveau solde.

### `grant_signup_credits()` (trigger `AFTER INSERT ON profiles`)

Remplace l'ancien appel : `grant_credit_lot(new.user_id, 100, 'signup', new.user_id::text,
now() + interval '30 days')`.

## 5. Migration des soldes existants

Pour chaque ligne de `cadam_credits` avec `balance > 0` : créer un lot `migration` expirant dans
30 jours, idempotent sur `ref = user_id` :

```sql
insert into public.cadam_credit_lots (user_id, reason, amount_initial, amount_remaining, expires_at, ref)
select user_id, 'migration', balance, balance, now() + interval '30 days', user_id::text
from public.cadam_credits where balance > 0
on conflict (reason, ref) where ref is not null do nothing;
```

À lancer **une fois** dans le SQL editor au déploiement, après création de la table + `notify pgrst`.

## 6. Paiement (clic3dprint)

### Produits

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

### `credit_orders` (table clic3dprint Postgres) — ajouter 2 colonnes

`reason text` et `ttl_hours int` (en plus de `credits, amount_tnd, konnect_ref, status, …`),
pour que le callback connaisse l'expiration à appliquer. (Migration via `db-init`.)

### Flux (réutilise l'existant, durci)

1. `POST /api/payment/credits {pack:'cr200'|'sub7000'}` → init D17, insère `credit_orders`
   (avec `reason`, `ttl_hours`).
2. Callback `/api/payment/credits-callback` (déjà durci : vérif serveur-à-serveur sur ref stockée,
   contrôle montant, grant-avant-flip, idempotent) → appelle
   `grant_credit_lot(uid, credits, reason, orderId, now() + ttl_hours*interval)` via
   `lib/cadam-credits.js` (mappe email→uid via `user_id_by_email`).

## 7. Gate génération (cadam `aiChat.ts`)

Inchangé en logique : pré-check `assertCreditsAvailable` (→ 402 si solde < 20), débit
`consumeCredits(user.id, 20, 'premium_generation', message_id)` au succès (gaté `!isContinuation`).
Les wrappers `src/server/credits.ts` appellent les RPC mises à jour (lots) — **signatures TS
inchangées** côté gate, seul le SQL change.

## 8. UI

### Solde (cadam, déjà câblé)

`billing-status` renvoie déjà le solde via `get_credit_balance` → reflète automatiquement les lots
non expirés. Aucun changement.

### Section explicative (clic3dprint `/creation`, sous l'iframe)

Bloc d'info statique en bas de la fenêtre IA expliquant :

- 1 génération = 20 crédits ; **100 crédits offerts à l'inscription (valables 30 j)**.
- **Pack : 200 crédits — 20 DT (valables 24 h)**.
- **Pass : 7000 crédits — 200 DT (valables 30 j)**.
- « À 0 crédit, la génération est bloquée jusqu'à rachat. » + bouton vers **`/recharge`**.
- `/recharge` liste les **2 produits** (pack + pass).

## 9. Sécurité / robustesse

- RPC crédits **`service_role` only** (lockdown existant) ; serveur via client service_role.
- **Double idempotence** : lots `(reason, ref)` + transactions `(reason, ref)` → ni double crédit
  ni double débit, même sur webhook/onFinish rejoué.
- Solde jamais négatif (`amount_remaining >= 0`, exception si insuffisant).
- `notify pgrst, 'reload schema'` après toute migration créant/modifiant des fonctions.

## 10. Hors scope (phases ultérieures)

- **Crédit closed-loop pour toute la plateforme** (payer un fichier STL en crédits, designers qui
  gagnent du crédit-boutique) — spec séparé, après validation juridique du périmètre fermé.
- **Cash-out / conversion crédits → dinars** — nécessite licence BCT (e-money) ; explicitement exclu.
- **Prélèvement récurrent automatique** de l'abo — D17 ne le gère pas ; abo = pass one-shot.
- Notifications d'expiration imminente (email/in-app) — nice-to-have, plus tard.

## 11. Tests

- `grant_credit_lot` : crée 1 lot, idempotent sur `(reason, ref)`, `expires_at` correct.
- `consume_credits` : débite le lot **le plus tôt-expirant d'abord** ; multi-lots → ordre correct ;
  refuse si solde insuffisant ; idempotent sur `ref`.
- `get_credit_balance` : **ignore les lots expirés** (créer un lot `expires_at` passé → non compté).
- Migration : convertit les soldes `cadam_credits` en lots 30 j, idempotente.
- Paiement : pack → lot 24 h ; pass → lot 30 j ; callback idempotent.
- Bout-en-bout : 100 (30 j) + achat pack 200 (24 h) → solde 300 ; génération → débite d'abord le
  lot pack (24 h) ; lot signup expiré (J+30) → non compté.
