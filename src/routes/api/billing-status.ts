import { createFileRoute } from '@tanstack/react-router';
import {
  isUnauthorizedError,
  json,
  preflight,
  requireUser,
} from '@/server/api';
import { billing } from '@/server/billingClient';
import { getAnonSupabaseClient } from '@/server/supabaseClient';
import { getBalance } from '@/server/credits';

export const Route = createFileRoute('/api/billing-status')({
  server: {
    handlers: {
      OPTIONS: preflight,
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          // clic3d-cadam: the real spendable balance is cadam_credits, not the
          // (bypassed) upstream billing service. Surface it in the token fields
          // the UI reads (LimitReachedMessage / LowPromptsWarning / balance).
          const supabase = getAnonSupabaseClient({
            global: {
              headers: {
                Authorization: request.headers.get('Authorization') ?? '',
              },
            },
          });
          const balance = await getBalance(user.id, supabase);
          const status = await billing.getStatus(user.email!);
          return json({
            ...status,
            tokens: {
              free: balance,
              subscription: 0,
              purchased: 0,
              total: balance,
            },
          });
        } catch (err) {
          return json(
            {
              error: isUnauthorizedError(err)
                ? 'Unauthorized'
                : 'billing_failed',
            },
            isUnauthorizedError(err) ? 401 : 502,
          );
        }
      },
    },
  },
});
