// clic3d (31/10/2026) : langue de l'interface (fr / en / ar).
// Source : paramètre d'URL ?lang= (posé par clic3d.tn sur l'iframe), puis la
// valeur mémorisée pour la session (la navigation interne perd ?lang), puis
// 'fr' par défaut (compatibilité avec l'ancienne URL sans paramètre).
// La langue est fixe pour la durée de vie de la page : clic3d recharge
// l'iframe quand l'utilisateur change de langue.

export const LANGS = ['fr', 'en', 'ar'] as const;
export type Lang = (typeof LANGS)[number];
export const DEFAULT_LANG: Lang = 'fr';
export const LANG_STORAGE_KEY = 'clic3d-lang';

export function isLang(value: unknown): value is Lang {
  return (
    typeof value === 'string' && (LANGS as readonly string[]).includes(value)
  );
}

let resolved: Lang | null = null;

function detectLang(): Lang {
  if (typeof window === 'undefined') return DEFAULT_LANG;
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('lang');
    if (isLang(fromUrl)) {
      try {
        window.sessionStorage.setItem(LANG_STORAGE_KEY, fromUrl);
      } catch {
        // sessionStorage indisponible (iframe tierce bloquée) : sans effet.
      }
      return fromUrl;
    }
  } catch {
    // URL illisible : on retombe sur la session puis le défaut.
  }
  try {
    const stored = window.sessionStorage.getItem(LANG_STORAGE_KEY);
    if (isLang(stored)) return stored;
  } catch {
    // ignore
  }
  return DEFAULT_LANG;
}

/** Langue courante (résolue une fois côté client ; 'fr' au prérendu). */
export function getLang(): Lang {
  if (typeof window === 'undefined') return DEFAULT_LANG;
  if (resolved === null) resolved = detectLang();
  return resolved;
}

export function getDir(lang: Lang = getLang()): 'rtl' | 'ltr' {
  return lang === 'ar' ? 'rtl' : 'ltr';
}

/** Applique lang/dir sur <html> (appelé au montage, en plus du script de tête). */
export function applyDocumentLang(): void {
  if (typeof document === 'undefined') return;
  const lang = getLang();
  document.documentElement.lang = lang;
  document.documentElement.dir = getDir(lang);
}

/**
 * Script inline exécuté dans <head> avant le premier rendu : pose lang/dir
 * tout de suite pour éviter un flash de mise en page en LTR. Même logique que
 * detectLang() (dupliquée car il s'exécute avant le bundle).
 */
export const LANG_BOOT_SCRIPT = `(function(){try{var L=['fr','en','ar'],k='${LANG_STORAGE_KEY}',l=null;try{l=new URLSearchParams(location.search).get('lang')}catch(e){}if(L.indexOf(l)<0){try{l=sessionStorage.getItem(k)}catch(e){}}if(L.indexOf(l)<0)l='${DEFAULT_LANG}';var h=document.documentElement;h.lang=l;h.dir=l==='ar'?'rtl':'ltr'}catch(e){}})();`;

/** Nombres toujours en chiffres 0-9 (jamais ٠-٩), séparateurs selon la langue. */
export function formatNumber(n: number, lang: Lang = getLang()): string {
  const locale = lang === 'fr' ? 'fr-FR' : 'en-US';
  return n.toLocaleString(locale);
}
