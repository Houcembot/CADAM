-- Baisse le lot de crédits offerts à l'inscription de 100 à 40 (2 générations
-- au lieu de 5, à 20 crédits/génération). Décision 2026-09-23.
create or replace function public.grant_signup_credits()
returns trigger language plpgsql security definer as $$
begin
  perform public.grant_credit_lot(new.user_id, 40, 'signup', new.user_id::text, now() + interval '30 days');
  return new;
end $$;

notify pgrst, 'reload schema';
