import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

const PARENT_ORIGIN =
  (import.meta.env.VITE_CLIC3D_PARENT_ORIGIN as string | undefined) ??
  'https://clic3d.tn';

export type SSOStatus = 'pending' | 'ready' | 'error';

export function useClic3dSSO(): SSOStatus {
  const [status, setStatus] = useState<SSOStatus>('pending');

  useEffect(() => {
    let cancelled = false;

    async function bridgeSession() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session) {
          if (!cancelled) setStatus('ready');
          return;
        }

        const tokenResp = await requestTokenFromParent();
        if (cancelled) return;

        const { error } = await supabase.auth.verifyOtp({
          type: 'magiclink',
          token_hash: tokenResp.token_hash,
        });
        if (error) throw error;
        if (!cancelled) setStatus('ready');
      } catch (e) {
        console.error('[clic3d-cadam] SSO bridge failed:', e);
        if (!cancelled) setStatus('error');
      }
    }

    bridgeSession();
    return () => {
      cancelled = true;
    };
  }, []);

  return status;
}

interface TokenResponse {
  token_hash: string;
  email: string;
}

function requestTokenFromParent(): Promise<TokenResponse> {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const timeout = setTimeout(() => {
      window.removeEventListener('message', handler);
      reject(new Error('parent timeout (5s)'));
    }, 5000);

    function handler(e: MessageEvent) {
      if (e.origin !== PARENT_ORIGIN) return;
      if (e.data?.type !== 'clic3d-cadam-token' || e.data?.id !== id) return;
      clearTimeout(timeout);
      window.removeEventListener('message', handler);
      if (e.data.error) reject(new Error(e.data.error));
      else resolve({ token_hash: e.data.token_hash, email: e.data.email });
    }

    window.addEventListener('message', handler);
    window.parent.postMessage(
      { type: 'clic3d-cadam-token-request', id },
      PARENT_ORIGIN,
    );
  });
}
