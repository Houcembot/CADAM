// clic3d-cadam: decides whether the credits reserved for an initial user turn
// are given back. Refunded when the turn produced nothing (no text, no
// reasoning, no tool call), or when it called tools and every one of them
// ended in `output-error` (e.g. create_mesh failing server-side): the user got
// no model. A pending client tool (`input-available`, build_parametric_model
// compiled in the browser afterwards) still counts as produced.
type GenerationPart = { type: string; text?: string; state?: string };

export function shouldRefundGeneration(parts: GenerationPart[]): boolean {
  const toolParts = parts.filter((part) => part.type.startsWith('tool-'));
  if (toolParts.length > 0) {
    return toolParts.every((part) => part.state === 'output-error');
  }
  const wroteSomething = parts.some(
    (part) =>
      (part.type === 'text' || part.type === 'reasoning') &&
      typeof part.text === 'string' &&
      part.text.trim().length > 0,
  );
  return !wroteSomething;
}
