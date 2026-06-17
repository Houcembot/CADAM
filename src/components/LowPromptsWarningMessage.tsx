// clic3d-cadam: soft warning shown when the credit balance is low (enough for
// roughly one more premium generation). CTA opens the parent /recharge page.
const PARENT_ORIGIN =
  (import.meta.env.VITE_CLIC3D_PARENT_ORIGIN as string | undefined) ??
  'https://clic3d.tn';

export function LowPromptsWarningMessage({
  tokensRemaining,
}: {
  tokensRemaining: number;
  layout?: 'inline' | 'stacked';
}) {
  const openRecharge = () =>
    window.open(`${PARENT_ORIGIN}/recharge`, '_blank', 'noopener');
  const gens = Math.floor(tokensRemaining / 20);

  return (
    <div className="p-3 text-center text-sm text-adam-text-secondary">
      <span>
        Il te reste {tokensRemaining} crédit{tokensRemaining === 1 ? '' : 's'}
        {gens > 0 ? ` (~${gens} génération${gens > 1 ? 's' : ''})` : ''}.{' '}
        <span
          className="cursor-pointer text-adam-blue hover:underline"
          onClick={openRecharge}
        >
          Recharger
        </span>
        .
      </span>
    </div>
  );
}
