import { useT } from '@/i18n';

// clic3d-cadam: soft warning shown when the credit balance is low (enough for
// roughly one more premium generation). CTA opens the parent /ia offers.
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
    window.open(`${PARENT_ORIGIN}/ia#t-offres`, '_blank', 'noopener');
  const gens = Math.floor(tokensRemaining / 20);
  const t = useT();

  return (
    <div className="p-3 text-center text-sm text-adam-text-secondary">
      <span>
        {t.balance.remaining(tokensRemaining, gens)}{' '}
        <span
          className="cursor-pointer text-adam-blue hover:underline"
          onClick={openRecharge}
        >
          {t.balance.getTokens}
        </span>
        .
      </span>
    </div>
  );
}
