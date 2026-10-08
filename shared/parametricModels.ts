// Modèles de génération paramétrique (OpenSCAD) de clic3d-cadam.
//
// Choix du 08/10/2026, sur banc d'essai (prompt et outil réels, 3 pièces
// compilées avec OpenSCAD et mesurées) : Claude Sonnet 4.5 en principal,
// GPT-5.6 Sol en secours chez un autre fournisseur. Sonnet 5 est écarté
// (une pièce non compilée, deux aux mauvaises dimensions).

export const PRIMARY_PARAMETRIC_MODEL = 'anthropic/claude-sonnet-4.5';
export const FALLBACK_PARAMETRIC_MODEL = 'openai/gpt-5.6-sol';

/**
 * Liste `models` envoyée à OpenRouter : si le premier modèle renvoie une
 * erreur (panne, saturation, limite de débit), OpenRouter rejoue la même
 * requête sur le suivant. Les deux modèles se servent mutuellement de
 * secours ; tout autre modèle part seul.
 */
export function openRouterModelsFor(modelId: string): string[] | undefined {
  if (modelId === PRIMARY_PARAMETRIC_MODEL) {
    return [PRIMARY_PARAMETRIC_MODEL, FALLBACK_PARAMETRIC_MODEL];
  }
  if (modelId === FALLBACK_PARAMETRIC_MODEL) {
    return [FALLBACK_PARAMETRIC_MODEL, PRIMARY_PARAMETRIC_MODEL];
  }
  return undefined;
}

const ALLOWED_CHAT_MODELS = new Set([
  PRIMARY_PARAMETRIC_MODEL,
  FALLBACK_PARAMETRIC_MODEL,
]);

/**
 * Le modèle vient du navigateur : sans ce filtre, n'importe qui pourrait
 * demander un modèle bien plus cher (Opus…) pour le même débit de tokens.
 * Tout ce qui n'est pas autorisé retombe sur le modèle principal.
 */
export function resolveChatModel(requested: string | null | undefined): string {
  return requested && ALLOWED_CHAT_MODELS.has(requested)
    ? requested
    : PRIMARY_PARAMETRIC_MODEL;
}
