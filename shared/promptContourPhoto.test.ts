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

  // Rejeu du 02/11 : avec hull() de 4 cercles, le verre reste un trapèze
  // arrondi même quand l'IA a bien vu l'écart.
  it('contour copié d’une photo : super-ellipse, pas hull() de 4 cercles', () => {
    assert.match(prompt, /superellipse/i);
    assert.match(prompt, /never\s+hull\(\)\s+four\s+circles/i);
    assert.match(prompt, /module\s+rounded_outline/);
  });

  // Rejeu du 02/11 : axe de charnière à travers la face posée à plat, la
  // branche aurait pivoté dans le plan des verres.
  it('charnière : axe selon la hauteur de la face, jamais à travers', () => {
    assert.match(prompt, /folds\s+around\s+in\s+use/i);
    assert.match(prompt, /never\s+through\s+the\s+front/i);
  });
});
