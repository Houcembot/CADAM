-- Sécurité crédits : les RPC de crédits ne doivent JAMAIS être appelables par
-- les clients. Sans ça, un utilisateur authentifié pourrait appeler grant_credits
-- via l'API REST Supabase et s'auto-créditer à l'infini.
--
-- On restreint les 3 RPC au role service_role :
--  - le serveur cadam (aiChat, billing-status) utilise un client service_role ;
--  - le webhook paiement (clic3dprint) utilise getSupabaseAdmin() (service_role) ;
--  - le trigger signup grant_signup_credits est SECURITY DEFINER (s'exécute en tant
--    qu'owner), donc il peut toujours appeler grant_credits malgré le revoke.

revoke execute on function public.grant_credits(uuid, int, text, text)
  from public, anon, authenticated;
revoke execute on function public.consume_credits(uuid, int, text, text)
  from public, anon, authenticated;
revoke execute on function public.get_credit_balance(uuid)
  from public, anon, authenticated;

grant execute on function public.grant_credits(uuid, int, text, text) to service_role;
grant execute on function public.consume_credits(uuid, int, text, text) to service_role;
grant execute on function public.get_credit_balance(uuid) to service_role;
