// clic3d-cadam: decides whether the credits reserved for an initial user turn
// are given back. Only a produced model is paid (15/11/2026, décision Houcem :
// les questions de l'IA sont gratuites). Refunded when the turn called no
// model-producing tool (a question, a clarification, a plain answer — text
// alone or answer_user), or when every model-producing tool it called ended in
// `output-error` (e.g. create_mesh failing server-side): the user got no
// model. A pending client tool (`input-available`, build_parametric_model
// compiled in the browser afterwards) still counts as produced.
type GenerationPart = { type: string; text?: string; state?: string };

export function shouldRefundGeneration(parts: GenerationPart[]): boolean {
  const modelTools = parts.filter(
    (part) => part.type.startsWith('tool-') && part.type !== 'tool-answer_user',
  );
  if (modelTools.length === 0) return true;
  return modelTools.every((part) => part.state === 'output-error');
}
