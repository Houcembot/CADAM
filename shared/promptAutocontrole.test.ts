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
  it('le client envoie l’image 4 vues, lue en priorité par le serveur', () => {
    assert.match(session, /generateCheckImage\(stl, off \?\? null\)/);
    assert.match(session, /check-\$\{toolCall\.toolCallId\}/);
    assert.match(src, /'\/check-\$1'/);
  });

  it('demande de comparer le rendu à la demande', () => {
    assert.match(prompt, /# Checking the render/);
    assert.match(prompt, /missing, floating or detached/i);
  });

  it('une seule correction automatique par tour', () => {
    assert.match(prompt, /at most one automatic correction/i);
  });

  // 02/11/2026 : lunettes validées « conformes aux photos » alors que la
  // monture était bien plus fine ; « trust your code » couvrait le doute.
  it('compare aux photos de référence (forme, proportions, épaisseurs)', () => {
    assert.match(prompt, /with those photos/i);
    assert.match(prompt, /thicknesses/i);
    assert.match(prompt, /clearly differs from the photos/i);
  });

  it('n’affirme pas la conformité sans la voir, dit quand il ne peut pas trancher', () => {
    assert.doesNotMatch(prompt, /trust your code/i);
    assert.match(prompt, /Never claim the model matches the photos/i);
    assert.match(prompt, /If you\s+cannot tell/i);
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
      /never use the words\s+render, preview, image, view or screenshot/i,
    );
  });

  it('le résultat de l’outil annonce le rendu joint', () => {
    assert.match(session, /attached image shows it from 4 labelled views/i);
  });

  // Banc du 27/10 : la règle du prompt seule laisse l'IA commenter le rendu
  // (3/8) ; la consigne est répétée dans le résultat de l'outil, à côté de l'image.
  it('le résultat de l’outil rappelle : rendu privé, deux phrases', () => {
    assert.match(session, /for your own check only/i);
    assert.match(session, /never mention the image/i);
    assert.match(session, /reference photos/i);
    assert.match(session, /at most two short sentences/i);
  });
});
