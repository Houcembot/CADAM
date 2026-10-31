import { Button } from '@/components/ui/button';
import { useNavigate } from '@tanstack/react-router';
import * as Sentry from '@sentry/react';
import { useEffect } from 'react';
import { useT } from '@/i18n';

export function ErrorView({ error }: { error?: unknown }) {
  const navigate = useNavigate();
  const t = useT();

  useEffect(() => {
    if (error) {
      Sentry.captureException(error);
    }
  }, [error]);

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-adam-bg-secondary-dark">
      <h1 className="text-2xl font-bold text-adam-text-primary">
        {t.errorView.title}
      </h1>
      <p className="text-center text-adam-text-secondary">
        {t.errorView.line1}
        <br />
        {t.errorView.line2}
      </p>
      <Button onClick={() => navigate({ to: '/' })}>{t.errorView.home}</Button>
    </div>
  );
}
