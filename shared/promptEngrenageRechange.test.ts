import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

// 02/11/2026 : priorité aux pièces mécaniques. Cas type : la roue de mixeur
// cassée, le client a la vieille roue, son téléphone et une règle simple. La
// roue doit s'engrener du premier coup. (Roue du 02/11 : 10 dents comptées
// sur photo au lieu de ~40.)
const src = readFileSync(
  new URL('../src/server/aiChat.ts', import.meta.url),
  'utf8',
);
const debut = src.indexOf('const PARAMETRIC_AGENT_PROMPT');
const prompt = src.slice(debut, src.indexOf('`;\n', debut));
const section = prompt.slice(prompt.indexOf('# Replacement gears'));

describe('prompt cadam — roue dentée de rechange', () => {
  it('a une section dédiée', () => {
    assert.match(prompt, /# Replacement gears/);
  });

  it('demande guidée : compter les dents, photo de face avec règle, photo de profil', () => {
    assert.match(section, /count\s+the\s+teeth/i);
    assert.match(section, /never\s+count\s+the\s+teeth\s+from\s+a\s+photo/i);
    assert.match(section, /ruler\s+across/i);
    assert.match(section, /side\s+photo/i);
  });

  it('module = diamètre / (dents + 2), arrondi à la série standard', () => {
    assert.match(section, /outer\s+diameter\s*\/\s*\(teeth\s*\+\s*2\)/i);
    assert.match(
      section,
      /0\.5,\s*0\.6,\s*0\.7,\s*0\.75,\s*0\.8,\s*1,\s*1\.25,\s*1\.5/,
    );
    assert.match(section, /more\s+than\s+5\s*%/i);
  });

  it('denture hélicoïdale vue de profil', () => {
    assert.match(section, /helical/i);
  });

  it('alésage : forme lue (rond, D, hexagonal, cannelé), taille d’axe courante, jeu 0,2 mm', () => {
    assert.match(section, /splined/i);
    assert.match(section, /hexagonal/i);
    assert.match(section, /0\.2\s*mm/);
  });

  it('récapitulatif des valeurs avant impression', () => {
    assert.match(section, /teeth,\s+module,\s+outer\s+diameter/i);
  });

  // Banc du 02/11 : pignon de 10 dents mesuré 25 mm -> module 2, mais BOSL2
  // décale le profil des petits pignons et sort 25,7 mm.
  it('petits pignons : décalage de profil calculé depuis le diamètre mesuré', () => {
    assert.match(
      section,
      /profile_shift\s*=\s*\(measured\s+outer\s+diameter\s*\/\s*module\s*-\s*teeth\s*-\s*2\)\s*\/\s*2/i,
    );
    assert.match(section, /fewer\s+than\s+17\s+teeth/i);
  });
});
