-- clic3d-cadam: tolerate users without email/raw_user_meta in handle_new_user trigger.
-- Without this fallback, profiles.full_name NOT NULL violation would roll back the auth.users insert
-- and GoTrue would return 500 "Database error creating anonymous user".

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      split_part(NEW.email, '@', 1),
      'Guest'
    )
  );
  RETURN NEW;
END;
$$;
