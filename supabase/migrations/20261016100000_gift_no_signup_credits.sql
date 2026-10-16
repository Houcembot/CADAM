-- Crédits offerts par l'admin clic3d (tests IA, codes pass) : raison 'gift'.
-- Les inscriptions ne reçoivent plus de crédits automatiques (16/10/2026) ;
-- les lots déjà versés restent. Rejouable.
alter table public.cadam_credit_lots drop constraint if exists cadam_credit_lots_reason_check;
alter table public.cadam_credit_lots add constraint cadam_credit_lots_reason_check
  check (reason in ('signup','pack','subscription','migration','refund','gift'));

create or replace function public.grant_signup_credits()
returns trigger language plpgsql security definer as $$
begin
  return new;
end $$;

notify pgrst, 'reload schema';
