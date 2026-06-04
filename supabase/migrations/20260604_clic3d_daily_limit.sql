-- clic3d-cadam: daily generation limit per user.
-- Each authenticated user can run up to N AI generations per UTC day.
-- The limit itself is enforced in `src/server/aiChat.ts` (configurable
-- via CLIC3D_DAILY_LIMIT env, default 10).

CREATE TABLE IF NOT EXISTS public.cadam_daily_usage (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  generation_count int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, date)
);

ALTER TABLE public.cadam_daily_usage ENABLE ROW LEVEL SECURITY;

-- Users can read their own usage row (for showing remaining quota in UI).
DROP POLICY IF EXISTS "user can read own usage" ON public.cadam_daily_usage;
CREATE POLICY "user can read own usage"
  ON public.cadam_daily_usage
  FOR SELECT
  USING (auth.uid() = user_id);

-- Writes go through the RPC below (which runs as security definer).

-- RPC: atomically increment today's count for a user.
-- Returns the new count after increment.
CREATE OR REPLACE FUNCTION public.increment_cadam_daily_usage(uid uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_count int;
BEGIN
  INSERT INTO public.cadam_daily_usage (user_id, date, generation_count)
  VALUES (uid, CURRENT_DATE, 1)
  ON CONFLICT (user_id, date)
  DO UPDATE SET
    generation_count = cadam_daily_usage.generation_count + 1,
    updated_at = now()
  RETURNING generation_count INTO new_count;
  RETURN new_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_cadam_daily_usage(uuid) TO service_role;
