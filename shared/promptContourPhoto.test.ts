import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

// 02/11/2026 : lunettes depuis une photo (règle visible). Le modèle a fait un
// trapèze à coins serrés au lieu d'un rectangle très arrondi, un pont plat au
// lieu d'un pont arqué, 134 mm au lieu de ~125 mm, et des branches sans
// aucune fixation. L'auto-contrôle 4 vues a conclu « comme sur votre photo ».
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

describe('prompt cadam — fidélité aux photos', () => {
  it('décrit le contour d’après la photo avant de construire', () => {
    assert.match(prompt, /#\s+Working\s+from\s+photos/);
    assert.match(prompt, /corner\s+radi/i);
    assert.match(prompt, /sides\s+are\s+straight,\s+slanted\s+or\s+curved/i);
    assert.match(prompt, /width-to-height\s+ratio/i);
  });

  it('remet la photo dans le bon sens avant de lire la forme', () => {
    assert.match(prompt, /rotated\s+or\s+seen\s+at\s+an\s+angle/i);
  });

  it('mesure avec la règle visible sur la photo', () => {
    assert.match(prompt, /ruler,\s+tape\s+measure/i);
    assert.match(prompt, /measure\s+with\s+it/i);
  });

  it('au contrôle, reprend les traits notés un par un', () => {
    const check = prompt.slice(prompt.indexOf('# Checking the render'));
    assert.match(check, /outline\s+traits\s+you\s+noted/i);
    assert.match(check, /same\s+kind\s+of\s+object\s+is\s+not\s+a\s+match/i);
    assert.match(session, /outline\s+traits\s+you\s+noted/i);
  });

  it('prévoit l’assemblage des pièces séparées', () => {
    assert.match(prompt, /hinge/i);
    assert.match(prompt, /never\s+leave\s+a\s+part\s+loose/i);
  });
});
