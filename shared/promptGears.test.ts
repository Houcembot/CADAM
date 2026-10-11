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

// 11/10/2026 : Sonnet 4.6 laissait 2 fois sur 3 les dents de deux engrenages
// se chevaucher (pas de déphasage) ; l'entraxe m*(z1+z2)/2 est faux dès que
// BOSL2 corrige le profil d'un petit pignon. Règle vérifiée sous OpenSCAD
// (20/40, 15/21, 15/40, 20/21, 9/30, 12/13 : intersection vide).
describe('prompt cadam — engrenages appariés', () => {
  it('impose gear_dist et le déphasage gear_spin', () => {
    assert.ok(
      src.includes('right(gear_dist(mod=m, teeth1=teeth1, teeth2=teeth2))'),
    );
    assert.ok(src.includes('gear_spin=-90'));
    assert.ok(src.includes('gear_spin=90-180/teeth2'));
  });
});
