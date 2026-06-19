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
drop policy if exists "read own lots" on public.cadam_credit_lots;
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
create or replace function public.consume_credits(uid uuid, amount int, p_reason text, p_ref text)
returns int language plpgsql security definer as $$
declare remaining int := amount; lot record;
begin
  if amount <= 0 then raise exception 'amount must be positive'; end if;
  if p_ref is not null and exists (
    select 1 from public.cadam_credit_transactions where reason = p_reason and ref = p_ref
  ) then
    return public.get_credit_balance(uid);
  end if;
  if public.get_credit_balance(uid) < amount then
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
    values (uid, -amount, p_reason, p_ref);
  return public.get_credit_balance(uid);
end $$;

-- 5) Trigger signup -> lot de 100 crédits valable 30 jours
create or replace function public.grant_signup_credits()
returns trigger language plpgsql security definer as $$
begin
  perform public.grant_credit_lot(new.user_id, 100, 'signup', new.user_id::text, now() + interval '30 days');
  return new;
end $$;

-- 6) Sécurité : la nouvelle RPC grant_credit_lot = service_role only
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
