import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

// 27/10/2026 : la figurine Jett de prod est sortie sans corps ni tête ; l'IA
// avait reçu le rendu (image jointe au résultat de l'outil) mais rien ne lui
// demandait de le regarder. Elle le vérifie désormais et corrige une fois.
const src = readFileSync(
  new URL('../src/server/aiChat.ts', import.meta.url),
  'utf8',
);
const session = readFileSync(
  new URL('../src/components/chat/ChatSession.tsx', import.meta.url),
  'utf8',
);
const debut = src.indexOf('const PARAMETRIC_AGENT_PROMPT');
const prompt = src.slice(debut, src.indexOf('`;\n', debut));

describe('prompt cadam — auto-contrôle du rendu', () => {
  it('demande de comparer le rendu à la demande', () => {
    assert.match(prompt, /# Checking the render/);
    assert.match(prompt, /missing, floating or detached/i);
  });

  it('une seule correction automatique par tour', () => {
    assert.match(prompt, /at most one automatic correction/i);
  });

  it('ne dit jamais ce qu’il a pu ou non vérifier', () => {
    assert.match(prompt, /never\s+say what you could or could not check/i);
  });

  // 27/10 : vrais essais en prod — réponse finale de 90 mots en moyenne, et
  // le rendu commenté au client 3 fois sur 10 malgré la règle.
  it('réponse finale courte, sans répéter la description', () => {
    assert.match(prompt, /at most two short sentences/i);
    assert.match(prompt, /do not repeat what\s+you said before the build/i);
  });

  it('liste les mots à ne jamais employer sur le rendu', () => {
    assert.match(
      prompt,
      /never use the words\s+render, preview, image or screenshot/i,
    );
  });

  it('le résultat de l’outil annonce le rendu joint', () => {
    assert.match(session, /attached image is a render/i);
  });
});
