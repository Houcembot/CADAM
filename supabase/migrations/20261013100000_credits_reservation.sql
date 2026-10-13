-- Crédits : réservation avant l'appel IA + remboursement si la génération échoue
-- (revue Codex 11/10/2026, bloquants 1 et 2). Rejouable sans erreur.
--
-- 1) consume_credits sérialisé par utilisateur : deux générations simultanées ne
--    peuvent plus passer le contrôle de solde sur le même solde. Si les lots ne
--    couvrent pas le montant après verrouillage, exception (plus de transaction
--    -20 enregistrée sans débit réel).
-- 2) refund_credits : rend les crédits d'une réservation (génération échouée ou
--    vide), une seule fois par réservation.

-- Raisons autorisées : + 'refund' (lots et ledger)
alter table public.cadam_credit_lots drop constraint if exists cadam_credit_lots_reason_check;
alter table public.cadam_credit_lots add constraint cadam_credit_lots_reason_check
  check (reason in ('signup','pack','subscription','migration','refund'));
alter table public.cadam_credit_transactions drop constraint if exists cadam_credit_transactions_reason_check;
alter table public.cadam_credit_transactions add constraint cadam_credit_transactions_reason_check
  check (reason in ('signup_grant','pack_purchase','premium_generation','refund'));

create or replace function public.consume_credits(uid uuid, amount int, p_reason text, p_ref text)
returns int language plpgsql security definer as $$
declare remaining int := amount; lot record;
begin
  if amount <= 0 then raise exception 'amount must be positive'; end if;
  -- Un seul débit à la fois par utilisateur (verrou libéré en fin de transaction).
  perform pg_advisory_xact_lock(hashtextextended('cadam_credits:' || uid::text, 0));
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
  if remaining > 0 then
    raise exception 'insufficient_credits';
  end if;
  insert into public.cadam_credit_transactions(user_id, delta, reason, ref)
    values (uid, -amount, p_reason, p_ref);
  return public.get_credit_balance(uid);
end $$;

-- refund_credits : rend le débit (p_reason, p_ref) sous forme d'un lot 'refund'
-- qui expire comme le lot le plus tardif de l'utilisateur (au moins 24 h).
-- Sans débit correspondant ou déjà remboursé : ne fait rien. Renvoie le solde.
create or replace function public.refund_credits(uid uuid, p_reason text, p_ref text)
returns int language plpgsql security definer as $$
declare debit int; lot_expiry timestamptz;
begin
  if p_ref is null then raise exception 'ref required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('cadam_credits:' || uid::text, 0));
  select -delta into debit from public.cadam_credit_transactions
    where user_id = uid and reason = p_reason and ref = p_ref and delta < 0;
  if debit is null or exists (
    select 1 from public.cadam_credit_transactions where reason = 'refund' and ref = p_ref
  ) then
    return public.get_credit_balance(uid);
  end if;
  select greatest(max(expires_at), now() + interval '1 day') into lot_expiry
    from public.cadam_credit_lots where user_id = uid;
  insert into public.cadam_credit_lots(user_id, reason, amount_initial, amount_remaining, expires_at, ref)
    values (uid, 'refund', debit, debit, coalesce(lot_expiry, now() + interval '1 day'), p_ref);
  insert into public.cadam_credit_transactions(user_id, delta, reason, ref)
    values (uid, debit, 'refund', p_ref);
  return public.get_credit_balance(uid);
end $$;

revoke execute on function public.consume_credits(uuid,int,text,text) from public, anon, authenticated;
grant execute on function public.consume_credits(uuid,int,text,text) to service_role;
revoke execute on function public.refund_credits(uuid,text,text) from public, anon, authenticated;
grant execute on function public.refund_credits(uuid,text,text) to service_role;

notify pgrst, 'reload schema';
