-- Audit sécurité 03/11/2026.
-- 1. increment_cadam_daily_usage(uid) est SECURITY DEFINER et était exécutable par
--    anon/authenticated : n'importe qui pouvait gonfler le compteur d'un autre uid.
--    Aucun code ne l'appelle plus (quota désactivé) ; le serveur garde service_role.
revoke execute on function public.increment_cadam_daily_usage(uuid) from public, anon, authenticated;
grant execute on function public.increment_cadam_daily_usage(uuid) to service_role;

-- 2. Fonctions de déclencheur SECURITY DEFINER : pas d'appel RPC direct.
revoke execute on function public.grant_signup_credits() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- 3. search_path figé (avertissement Supabase function_search_path_mutable).
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('update_conversation_leaf','update_updated_at_column',
        'set_conversation_suggestions','user_id_by_email','grant_credits',
        'grant_signup_credits','get_credit_balance','grant_credit_lot','refund_credits',
        'grant_credit_lot_premier_usage','consume_credits')
  loop
    execute format('alter function %s set search_path = public, pg_temp', f.sig);
  end loop;
end $$;
