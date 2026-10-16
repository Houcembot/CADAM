// clic3d-cadam: credits model (premium-only). When the user runs out of
// credits the chat returns 402 and this message appears. The CTA opens the
// parent site's /ia offers (16/10/2026: « tokens », never « crédits ») (cadam runs in an iframe on clic3d.tn), so the
// user can buy a credit pack. The upstream trial/subscription flow is gone.
const PARENT_ORIGIN =
  (import.meta.env.VITE_CLIC3D_PARENT_ORIGIN as string | undefined) ??
  'https://clic3d.tn';

export function LimitReachedMessage() {
  const openRecharge = () => {
    window.open(`${PARENT_ORIGIN}/ia#t-offres`, '_blank', 'noopener');
  };

  return (
    <div className="p-3 text-center text-sm text-adam-text-secondary">
      <span>
        Plus de tokens.{' '}
        <span
          className="cursor-pointer text-adam-blue hover:underline"
          onClick={openRecharge}
        >
          Obtenir des tokens
        </span>{' '}
        pour continuer à générer.
      </span>
    </div>
  );
}
