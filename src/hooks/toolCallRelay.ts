/**
 * clic3d (19/10/2026) — relais des appels d'outil d'une conversation.
 *
 * Une nouvelle conversation démarre son flux dans PromptView, AVANT que
 * l'éditeur (ChatSession) n'ait branché son gestionnaire `onToolCall`. Avec
 * Claude en direct, l'appel `build_parametric_model` arrive souvent avant ce
 * branchement : il était perdu, la pièce n'était jamais compilée ni
 * enregistrée (outil bloqué en `input-available`), et le message suivant de la
 * conversation échouait (« Tool result is missing »).
 *
 * Le relais met ces appels en attente et les rejoue dès qu'un gestionnaire est
 * branché, au tour suivant de la boucle d'événements (le temps que l'éditeur
 * finisse ses effets). Il retient aussi les appels déjà pris en charge, pour
 * que la reprise « session précédente » ne les marque pas en erreur.
 */
type ToolCallContext = { toolCall: { toolCallId: string } };
type Handler<C> = (ctx: C) => unknown;

export type ToolCallRelay<C extends ToolCallContext> = {
  dispatch: (ctx: C) => unknown;
  setHandler: (handler: Handler<C> | undefined) => void;
  isInFlight: (toolCallId: string) => boolean;
};

export function createToolCallRelay<C extends ToolCallContext>(
  schedule: (fn: () => void) => void = (fn) => setTimeout(fn, 0),
): ToolCallRelay<C> {
  let handler: Handler<C> | undefined;
  const pending: C[] = [];
  const inFlight = new Set<string>();
  let flushScheduled = false;

  const flush = () => {
    flushScheduled = false;
    if (!handler) return;
    while (pending.length > 0) {
      const ctx = pending.shift()!;
      void Promise.resolve(handler(ctx));
    }
  };

  return {
    dispatch(ctx) {
      inFlight.add(ctx.toolCall.toolCallId);
      if (handler) return handler(ctx);
      pending.push(ctx);
      return undefined;
    },
    setHandler(next) {
      handler = next;
      if (next && pending.length > 0 && !flushScheduled) {
        flushScheduled = true;
        schedule(flush);
      }
    },
    isInFlight(toolCallId) {
      return inFlight.has(toolCallId);
    },
  };
}
