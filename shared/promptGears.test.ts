import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

// 09/10/2026 : un réducteur planétaire généré à la main avait les dents
// détachées du corps (profil démarré au cercle de base, pas au cercle de pied)
// et une couronne aux dents inversées (signe de la développante). Les
// engrenages doivent passer par BOSL2, jamais par une développante maison.
const src = readFileSync(
  new URL('../src/server/aiChat.ts', import.meta.url),
  'utf8',
);

describe('prompt cadam — engrenages', () => {
  it('impose BOSL2 gears.scad', () => {
    assert.match(src, /<BOSL2\/gears\.scad>/);
  });

  it('nomme les modules à utiliser', () => {
    for (const m of ['spur_gear(', 'ring_gear(', 'planetary_gears(']) {
      assert.ok(src.includes(m), m);
    }
  });

  it('interdit la développante écrite à la main', () => {
    assert.match(src, /never (?:hand-roll|write your own) involute/i);
  });
});

describe('prompt cadam — pièces posées sur le plateau', () => {
  it('impose anchor=BOTTOM pour les engrenages BOSL2', () => {
    assert.ok(src.includes('anchor=BOTTOM'));
  });
  it('interdit toute géométrie sous z = 0 dans une mise à plat', () => {
    assert.match(src, /nothing below z = 0/);
  });
});
