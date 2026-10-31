import { AuthProvider } from '@/contexts/AuthProvider';
import { TooltipProvider } from './components/ui/tooltip';
import { Toaster } from './components/ui/toaster';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Outlet } from '@tanstack/react-router';
import { MeshFilesProvider } from '@/contexts/MeshFilesContext';
import { PostHogProvider } from '@/contexts/PostHogProvider';
import { ErrorView } from '@/views/ErrorView';
import { isSupabaseConfigMissing } from '@/lib/supabase';
import { useEffect } from 'react';
import { applyDocumentLang, getDir } from '@/i18n';
import { DirectionProvider } from '@radix-ui/react-direction';

const queryClient = new QueryClient();

function MissingConfig() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-adam-bg-secondary-dark">
      <div className="max-w-xl px-4 text-center text-red-500">
        Missing API Keys. Please copy .env.local.template to .env.local and
        restart.
      </div>
    </div>
  );
}

function App({ error }: { error?: unknown }) {
  // Filet de sécurité si le script de tête n'a pas pu s'exécuter.
  useEffect(() => {
    applyDocumentLang();
  }, []);

  if (isSupabaseConfigMissing) {
    return <MissingConfig />;
  }

  return (
    // Sens de lecture transmis aux composants Radix (menus, défilement…).
    <DirectionProvider dir={getDir()}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <PostHogProvider>
            <MeshFilesProvider>
              <TooltipProvider delayDuration={0}>
                <Toaster />
                {error !== undefined ? <ErrorView error={error} /> : <Outlet />}
              </TooltipProvider>
            </MeshFilesProvider>
          </PostHogProvider>
        </AuthProvider>
      </QueryClientProvider>
    </DirectionProvider>
  );
}

export default App;
