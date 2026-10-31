import { getLang } from '@/i18n/lang';

// Whimsical loading verbs, inspired by Claude Code's spinner list,
// curated for the CAD / parametric modeling context.
export const SPINNER_VERBS = [
  'Architecting',
  'Bootstrapping',
  'Brewing',
  'Calculating',
  'Cerebrating',
  'Channeling',
  'Chiseling',
  'Cogitating',
  'Composing',
  'Computing',
  'Concocting',
  'Conjuring',
  'Considering',
  'Contemplating',
  'Crafting',
  'Creating',
  'Crunching',
  'Crystallizing',
  'Cultivating',
  'Deliberating',
  'Envisioning',
  'Extruding',
  'Fabricating',
  'Fiddle-faddling',
  'Finagling',
  'Forging',
  'Forming',
  'Generating',
  'Hatching',
  'Ideating',
  'Imagining',
  'Incubating',
  'Kneading',
  'Lofting',
  'Manifesting',
  'Marinating',
  'Materializing',
  'Meandering',
  'Mulling',
  'Musing',
  'Noodling',
  'Orchestrating',
  'Percolating',
  'Philosophizing',
  'Pondering',
  'Pontificating',
  'Prestidigitating',
  'Reticulating',
  'Ruminating',
  'Sculpting',
  'Simmering',
  'Sketching',
  'Spinning',
  'Sprouting',
  'Stewing',
  'Summoning',
  'Synthesizing',
  'Tessellating',
  'Thinking',
  'Tinkering',
  'Transfiguring',
  'Wrangling',
];

// clic3d (31/10/2026) : listes courtes en français et en arabe pour l'interface
// traduite (?lang=fr|ar). L'anglais garde la liste d'origine.
export const SPINNER_VERBS_FR = [
  'Réflexion',
  'Conception',
  'Calcul',
  'Modélisation',
  'Esquisse',
  'Assemblage',
  'Façonnage',
  'Sculpture',
  'Extrusion',
  'Ajustement',
  'Mesure',
  'Composition',
  'Préparation',
  'Optimisation',
  'Vérification',
];

export const SPINNER_VERBS_AR = [
  'جارٍ التفكير',
  'جارٍ التصميم',
  'جارٍ الحساب',
  'جارٍ النمذجة',
  'جارٍ الرسم',
  'جارٍ التجميع',
  'جارٍ التشكيل',
  'جارٍ الضبط',
  'جارٍ القياس',
  'جارٍ التحضير',
  'جارٍ التحسين',
  'جارٍ التحقق',
];

export function getSpinnerVerbs(): readonly string[] {
  const lang = getLang();
  if (lang === 'ar') return SPINNER_VERBS_AR;
  if (lang === 'fr') return SPINNER_VERBS_FR;
  return SPINNER_VERBS;
}

export function pickSpinnerVerb(): string {
  const verbs = getSpinnerVerbs();
  return verbs[Math.floor(Math.random() * verbs.length)];
}
