import { ar as arLocale, enUS, fr as frLocale } from 'date-fns/locale';
import type { Locale } from 'date-fns';
import { fr, type Dict } from './fr';
import { en } from './en';
import { ar } from './ar';
import { getDir, getLang, type Lang } from './lang';

export type { Dict, ModelText } from './fr';
export {
  getLang,
  getDir,
  formatNumber,
  applyDocumentLang,
  LANG_BOOT_SCRIPT,
  type Lang,
} from './lang';

const DICTS: Record<Lang, Dict> = { fr, en, ar };

/** Dictionnaire de la langue courante, utilisable hors composant (toasts, services). */
export function getT(): Dict {
  return DICTS[getLang()];
}

/**
 * Hook d'interface. La langue ne change pas pendant la vie de la page
 * (l'iframe est rechargée par clic3d), donc pas de contexte ni d'état.
 */
export function useLang(): { lang: Lang; dir: 'rtl' | 'ltr'; t: Dict } {
  const lang = getLang();
  return { lang, dir: getDir(lang), t: DICTS[lang] };
}

export function useT(): Dict {
  return DICTS[getLang()];
}

/**
 * Messages d'erreur renvoyés par le serveur (texte français figé) : on les
 * remplace par leur traduction ; en arabe, un message inconnu est remplacé
 * par le message générique pour ne pas afficher de français/anglais.
 */
export function localizeServerError(
  message: string | undefined | null,
): string {
  const t = getT();
  const msg = (message ?? '').trim();
  if (!msg) return t.errors.modelCallFailed;
  if (
    /momentan[ée]ment indisponible|service unavailable|not configured/i.test(
      msg,
    )
  ) {
    return t.errors.serviceUnavailable;
  }
  if (/insufficient_credits/i.test(msg)) {
    return t.errors.outOfTokens;
  }
  if (getLang() === 'ar') return t.errors.modelCallFailed;
  return msg;
}

/** Locale date-fns (la locale arabe de date-fns garde les chiffres 0-9). */
export function getDateLocale(): Locale {
  const lang = getLang();
  return lang === 'ar' ? arLocale : lang === 'en' ? enUS : frLocale;
}
