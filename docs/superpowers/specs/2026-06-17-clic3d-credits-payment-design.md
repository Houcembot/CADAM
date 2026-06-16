# clic3d — Crédits premium & paiement (Phase 2) — Design

**Date :** 2026-06-17
**Repos concernés :** `clic3d-cadam` (Vercel) + `clic3dprint` (Railway)
**Statut :** spec à valider avant implémentation

---

## 1. Objectif

Monétiser via un système de **crédits**. **Décision : le premium est la SEULE voie** — pas
de tier Flash gratuit illimité.

- Le modèle servi est **Gemini 3.1 Pro** (premium). Le pool gratuit (Flash/Flash-Lite) n'est
  plus proposé à l'utilisateur.
- **Toute génération coûte 20 crédits** (gating uniforme, pas de branche « gratuit »).
- Chaque nouvel utilisateur reçoit **100 crédits offerts** (= 5 générations) pour essayer le
  premium → bonne première impression, puis achat obligatoire.
- On recharge en achetant un **pack** payé en dinars, **D17 en premier** (Flouci ensuite).

## 2. Décisions déjà actées (à ne pas rediscuter)

| Élément                               | Valeur                                                           |
| ------------------------------------- | ---------------------------------------------------------------- |
| Modèle premium                        | `google/gemini-3.1-pro-preview` (déjà défaut premium en prod)    |
| Coût d'une génération premium         | **20 crédits**                                                   |
| Crédits offerts au nouvel utilisateur | **100 crédits** (= 5 générations premium)                        |
| Pack payant                           | **20 DT = 200 crédits** (= 10 générations premium)               |
| Tier gratuit illimité                 | **aucun** — premium = seule voie (Flash retiré du sélecteur)     |
| Coût réel mesuré                      | ~$0,10/génération premium (OpenRouter) → marge pack ~84 %        |
| Paiement                              | **D17 en premier**, Flouci ensuite (rails existants clic3dprint) |

> 1 crédit ≈ 0,10 DT de prix de vente. L'unité « crédit » est cosmétique (gros chiffres
> marketing) ; la vraie unité de coût est la **génération premium** (~0,31 DT de coût).

## 3. Architecture

Deux repos, un seul Supabase (celui de cadam, `vjhafkljcbzhbjkagcfo` — le SSO bridge y crée
déjà les utilisateurs, et clic3dprint y a un accès admin via `getSupabaseAdmin()`).

```
┌─────────────────────────────┐         ┌──────────────────────────────┐
│  clic3dprint (Railway)      │         │  clic3d-cadam (Vercel)       │
│  - page d'achat de pack     │         │  - génération (aiChat.ts)    │
│  - init paiement D17/Flouci │         │  - GATE premium: solde≥20 ?  │
│  - webhook callback paiement│         │  - DÉDUIT 20 crédits/succès  │
│  - VÉRIF serveur-à-serveur  │         │  - GRANT 100 crédits/signup  │
│  - +200 crédits (service)   │────────▶│  - expose le solde à l'UI    │
└─────────────────────────────┘  écrit  └──────────────────────────────┘
            via getSupabaseAdmin()            lit/écrit
                         ▼  Supabase cadam  ▼
                ┌────────────────────────────────┐
                │ cadam_credits                  │
                │ cadam_credit_transactions      │
                └────────────────────────────────┘
```

## 4. Modèle de données (Supabase cadam)

### `cadam_credits`

| colonne      | type                     | note                |
| ------------ | ------------------------ | ------------------- |
| `user_id`    | uuid (PK, FK auth.users) | un solde par user   |
| `balance`    | integer (≥ 0)            | crédits disponibles |
| `updated_at` | timestamptz              |                     |

### `cadam_credit_transactions` (ledger d'audit)

| colonne      | type        | note                                                                             |
| ------------ | ----------- | -------------------------------------------------------------------------------- |
| `id`         | uuid (PK)   |                                                                                  |
| `user_id`    | uuid        |                                                                                  |
| `delta`      | integer     | +100 grant, +200 achat, −20 génération                                           |
| `reason`     | text        | `signup_grant` \| `pack_purchase` \| `premium_generation`                        |
| `ref`        | text null   | id paiement (achat) ou conversation/message (génération) — **clé d'idempotence** |
| `created_at` | timestamptz |                                                                                  |

**RPC atomiques** (évitent les races, comme `increment_cadam_daily_usage`) :

- `grant_credits(uid, amount, reason, ref)` → insère une transaction + met à jour le solde,
  **no-op si `ref` déjà présent** (idempotent).
- `consume_credits(uid, amount, reason, ref)` → vérifie `balance ≥ amount`, débite,
  insère la transaction ; renvoie le nouveau solde ou échoue si insuffisant.

## 5. Gating côté cadam (`src/server/aiChat.ts`)

On garde la même structure que l'ancien quota (qui est maintenant désactivé). **Premium =
seule voie → TOUTE génération coûte 20 crédits** (pas de branche « gratuit ») :

1. **Pré-check** (avant l'appel LLM, read-only) : si `balance < 20` →
   réponse `402` `{ error: 'insufficient_credits', balance, needed: 20 }`. Le client
   affiche « achète des crédits ».
2. **Déduction** (dans `streamText.onFinish`, **succès uniquement**, gaté `!isContinuation`
   comme le compteur actuel) : `consume_credits(user, 20, 'premium_generation', message_id)`.
3. **Échec/erreur** : pas de déduction (onError ≠ onFinish), donc une compilation ratée ou
   un quota OpenRouter ne brûle pas de crédits.

> Réutilise la logique `!isContinuation` déjà en place pour « 1 génération = 1 tour ».

## 6. Crédits offerts au signup (100)

Au premier login d'un utilisateur (création du profil), `grant_credits(uid, 100,
'signup_grant', uid)` — idempotent via `ref = uid` (jamais deux fois). Implémentation :

- **Option A (recommandée)** : trigger Postgres `AFTER INSERT ON profiles` qui appelle la RPC.
- Option B : à la première requête cadam authentifiée si pas de ligne `cadam_credits`.

## 7. Flux d'achat (clic3dprint)

1. **Page pack** (`/credits` ou nouvelle `/credits/acheter`) : bouton « 200 crédits — 20 DT »,
   l'utilisateur connecté clique.
2. **Init paiement** : `POST /api/payment/credits` crée un paiement **D17** (Flouci en
   phase ultérieure), en réutilisant le pattern de `app/api/payment/route.js` +
   `d17-callback`, avec en métadonnée `{ user_id, pack: 'cr200' }`.
3. **Callback / webhook** (`/api/payment/d17-callback`) :
   - **VÉRIFIE le paiement serveur-à-serveur** auprès de D17/Flouci (règle absolue clic3d :
     jamais créditer sans vérif serveur-à-serveur).
   - si payé → `getSupabaseAdmin().rpc('grant_credits', { uid, amount: 200, reason:
'pack_purchase', ref: <payment_id> })` — **idempotent** sur `payment_id` (un webhook
     rejoué ne crédite pas deux fois).
4. Redirection vers `/creation?mode=ai#generation-ia` avec le solde rafraîchi.

## 8. UI

- **Sélecteur de modèle premium-only** : `PARAMETRIC_MODELS` (src/lib/utils.ts) ne garde que
  les modèles premium (Gemini 3.1 Pro par défaut) ; on **retire les entrées `:free`**
  (Flash/Gemma/etc.). Le pool gratuit serveur (`modelPool`/override `:free`) devient du code
  dormant — laissé en place mais plus déclenché par une sélection utilisateur.
- **Affichage du solde** : « 🪙 200 crédits » dans l'app cadam (raccorder le composant de
  solde existant à `cadam_credits` au lieu du service billing externe bypassé).
- **Message « crédits insuffisants »** : quand `balance < 20`, CTA « Acheter des crédits »
  → ouvre la page pack (postMessage parent depuis l'iframe, comme le SSO).
- **Remplacer la copie obsolète** « Service gratuit, limite 10 générations/jour/compte »
  (clic3dprint `ModeToggle.js:156`) par la mention crédits.

## 9. Sécurité / robustesse

- **Idempotence** : `ref` unique sur transactions (payment_id pour achat, message_id pour
  génération) → webhooks rejoués et retries ne double-créditent/débitent jamais.
- **Vérif serveur-à-serveur** du paiement obligatoire avant `grant_credits`.
- **Solde jamais négatif** : `consume_credits` refuse si insuffisant (contrainte `balance ≥ 0`).
- **Service role key** de cadam : déjà présent côté clic3dprint (SSO) — ne jamais l'exposer
  au client.

## 10. Hors scope (phases ultérieures)

- Abonnement mensuel récurrent (ici = packs one-shot uniquement).
- Rebrand visuel du **logo** (`Adam-Logo.png` + `alt=`) et liens GitHub upstream.
- Renommer le défaut de modèle affiché dans `PromptView` (cosmétique : affiche Gemma, exécute Flash).
- Prompt caching (optimisation de marge).

## 11. Décisions (résolues)

1. **Paiement** : ✅ **D17 en premier**, Flouci en phase ultérieure.
2. **Accès** : ✅ **premium = seule voie** — pas de Flash gratuit illimité ; les 100 crédits
   offerts servent à essayer, puis achat obligatoire.
3. **Page d'achat** : sur **clic3dprint** (`/credits`), avec retour vers l'iframe.
   _(recommandation — à confirmer à l'implémentation)_
4. **Supabase partagé** : à vérifier en début d'implémentation que `getSupabaseAdmin()`
   (clic3dprint) pointe sur le projet cadam `vjhafkljcbzhbjkagcfo` (très probable — le SSO y
   crée les users). _(vérif technique, pas une décision produit)_

## 12. Tests

- RPC `consume_credits` : refuse à 19 crédits, débite à 20, idempotent sur `ref`.
- RPC `grant_credits` : idempotent sur `ref` (webhook rejoué = +0).
- Gate aiChat : bloqué à <20 (402), déduction seulement au succès, pas de déduction sur erreur.
- Webhook paiement : vérif serveur-à-serveur, crédite une seule fois.
- Signup : 100 crédits une seule fois.
