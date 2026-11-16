// 16/11/2026 : une question de l'IA (answer_user) attend la réponse du client.
// Le navigateur relançait l'IA dès qu'un outil était terminé
// (lastAssistantMessageIsCompleteWithToolCalls) ; answer_user étant exécuté côté
// serveur, la relance partait aussitôt et l'IA construisait une pièce sans
// attendre la réponse (vu en prod le 16/11 10:42 : question + modèle, tour
// remboursé). On ne relance donc pas quand la dernière étape contient une question.

type Part = { type: string };
type Msg = { role: string; parts: Part[] };

export function lastStepAsksUser(messages: Msg[]): boolean {
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'assistant') return false;
  const parts = last.parts ?? [];
  let start = 0;
  for (let i = parts.length - 1; i >= 0; i--) {
    if (parts[i].type === 'step-start') {
      start = i;
      break;
    }
  }
  return parts.slice(start).some((p) => p.type === 'tool-answer_user');
}

export function shouldAutoContinue<M extends Msg>(
  messages: M[],
  isCompleteWithToolCalls: (arg: { messages: M[] }) => boolean,
): boolean {
  if (lastStepAsksUser(messages)) return false;
  return isCompleteWithToolCalls({ messages });
}
