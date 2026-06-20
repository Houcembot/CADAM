import { Zap } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

function formatCompact(n: number): string {
  if (n >= 1_000_000) {
    const v = n / 1_000_000;
    return `${v >= 10 ? v.toFixed(0) : v.toFixed(1)}M`;
  }
  if (n >= 1_000) {
    const v = n / 1_000;
    return `${v >= 100 ? v.toFixed(0) : v.toFixed(1)}K`;
  }
  return n.toLocaleString();
}

// clic3d-cadam: a simple, non-interactive credit balance pill. The upstream
// hover popover (plans in dollars, "Upgrade", "View plans" -> /subscription)
// is removed — clic3d sells credit packs via the parent site (/recharge), not
// an in-app dollar subscription.
export function CreditsButton() {
  const { user, billing } = useAuth();
  const credits = billing?.tokens.total ?? 0;
  if (!user) return null;
  return (
    <div
      aria-label="Crédits"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full',
        'bg-adam-neutral-950 px-3 py-1.5 text-sm font-medium',
        'border border-white/5 text-adam-neutral-10 shadow-sm',
      )}
    >
      <Zap className="h-3.5 w-3.5" fill="currentColor" />
      <span>{formatCompact(credits)} crédits</span>
    </div>
  );
}
