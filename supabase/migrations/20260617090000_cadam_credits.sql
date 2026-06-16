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

-- Lookup d'un user auth par email. `profiles` n'a pas de colonne email, donc le
-- webhook paiement (clic3dprint) mappe l'identité par email via auth.users.
-- SECURITY DEFINER pour lire auth.users ; restreint au service_role (jamais exposé
-- aux clients : email -> uuid serait une fuite d'info).
create or replace function public.user_id_by_email(p_email text)
returns uuid language sql security definer as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1;
$$;
revoke all on function public.user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.user_id_by_email(text) to service_role;

-- Signup grant : 100 crédits à la création du profil (idempotent via ref = user_id)
create or replace function public.grant_signup_credits()
returns trigger language plpgsql security definer as $$
begin
  -- NB: profiles.user_id (FK auth.users), PAS profiles.id (PK propre du profil)
  perform public.grant_credits(new.user_id, 100, 'signup_grant', new.user_id::text);
  return new;
end $$;

drop trigger if exists trg_grant_signup_credits on public.profiles;
create trigger trg_grant_signup_credits
  after insert on public.profiles
  for each row execute function public.grant_signup_credits();
