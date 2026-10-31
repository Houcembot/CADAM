import { createRootRoute, HeadContent, Scripts } from '@tanstack/react-router';
import App from '@/App';
import '@/index.css';
import { LANG_BOOT_SCRIPT } from '@/i18n';

const assetUrl = (path: string) =>
  `${import.meta.env.BASE_URL.replace(/\/?$/, '/')}${path.replace(/^\//, '')}`;

export const Route = createRootRoute({
  head: () => ({
    meta: [{ title: 'clic3d' }],
  }),
  component: RootComponent,
  errorComponent: ({ error }) => (
    <RootDocument>
      <App error={error} />
    </RootDocument>
  ),
});

function RootComponent() {
  return (
    <RootDocument>
      <App />
    </RootDocument>
  );
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    // lang/dir réels posés par LANG_BOOT_SCRIPT (avant le bundle) puis par
    // applyDocumentLang() : le shell prérendu ne connaît pas ?lang.
    <html lang="fr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: LANG_BOOT_SCRIPT }} />
        <meta charSet="UTF-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0, viewport-fit=cover"
        />
        <link rel="icon" type="image/x-icon" href={assetUrl('adam-icon.ico')} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
