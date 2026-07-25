import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

const PARENT_ORIGIN =
  (import.meta.env.VITE_CLIC3D_PARENT_ORIGIN as string | undefined) ??
  'https://clic3d.tn';

const PARENT_TIMEOUT_MS = 5000;

export type SSOStatus = 'pending' | 'ready' | 'error';

export function useClic3dSSO(): SSOStatus {
  const [status, setStatus] = useState<SSOStatus>('pending');

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function bridgeSession() {
      try {
        // Toujours demander le token du parent : il identifie l'utilisateur clic3d
        // COURANT (email réel, ou fb-<id>@users.clic3d.tn pour un compte Facebook
        // sans email). C'est la source de vérité de "qui est connecté".
        const tokenResp = await requestTokenFromParent(controller.signal);
        if (cancelled) return;

        // Une session Supabase peut persister dans le navigateur (localStorage).
        // On ne la réutilise QUE si elle appartient bien à l'utilisateur clic3d
        // courant. Sinon (ancien Gmail d'une session précédente, navigateur
        // partagé, 2e compte du même visiteur) on la purge et on relie l'iframe
        // au bon compte — sans quoi l'historique/crédits partiraient sur le
        // mauvais compte.
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const current = session?.user?.email?.toLowerCase() ?? null;
        const expected = tokenResp.email?.toLowerCase() ?? null;

        if (session && current && expected && current === expected) {
          if (!cancelled) setStatus('ready');
          return;
        }

        if (session) {
          // Session d'un AUTRE compte → on la supprime avant de relier.
          await supabase.auth.signOut();
        }

        const { error } = await supabase.auth.verifyOtp({
          type: 'magiclink',
          token_hash: tokenResp.token_hash,
        });
        if (error) throw error;
        if (!cancelled) setStatus('ready');
      } catch (e) {
        if (
          cancelled ||
          (e instanceof DOMException && e.name === 'AbortError')
        ) {
          return;
        }
        console.error('[clic3d-cadam] SSO bridge failed:', e);
        setStatus('error');
      }
    }

    bridgeSession();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  return status;
}

interface TokenResponse {
  token_hash: string;
  email: string;
}

function requestTokenFromParent(signal: AbortSignal): Promise<TokenResponse> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('aborted', 'AbortError'));
      return;
    }

    const id = crypto.randomUUID();

    function cleanup() {
      clearTimeout(timeout);
      window.removeEventListener('message', handler);
      signal.removeEventListener('abort', onAbort);
    }

    function onAbort() {
      cleanup();
      reject(new DOMException('aborted', 'AbortError'));
    }

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('parent timeout (5s)'));
    }, PARENT_TIMEOUT_MS);

    function handler(e: MessageEvent) {
      if (e.origin !== PARENT_ORIGIN) return;
      if (e.data?.type !== 'clic3d-cadam-token' || e.data?.id !== id) return;
      cleanup();
      if (e.data.error) reject(new Error(e.data.error));
      else resolve({ token_hash: e.data.token_hash, email: e.data.email });
    }

    window.addEventListener('message', handler);
    signal.addEventListener('abort', onAbort);
    window.parent.postMessage(
      { type: 'clic3d-cadam-token-request', id },
      PARENT_ORIGIN,
    );
  });
}
