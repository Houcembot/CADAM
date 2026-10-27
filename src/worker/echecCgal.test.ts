import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { echecCgal } from './echecCgal.ts';

// 27/10/2026 : vraie génération en prod (Jett) — trois hull() de sphères
// ont planté dans CGAL (« CGAL error in applyHull »), OpenSCAD a quand même
// fini avec le code 0 et la figurine est sortie sans corps, jambes ni tête.
const LOG_PROD = [
  'CGAL error: assertion violation!',
  'ERROR: CGAL error in applyHull(): CGAL ERROR: assertion violation!',
  'Expr: e->is_border()',
];

describe('echecCgal', () => {
  it('signale un hull() perdu, avec la consigne pour le refaire', () => {
    const msg = echecCgal(LOG_PROD);
    assert.ok(msg);
    assert.match(msg, /hull\(\)/);
    assert.match(msg, /cuboid\(.*rounding/);
  });

  it('signale toute autre erreur CGAL qui fait perdre de la géométrie', () => {
    assert.ok(echecCgal(['ERROR: CGAL error in CGALUtils::applyUnion3D: x']));
  });

  it('ignore un journal propre et les simples avertissements', () => {
    assert.equal(echecCgal([]), null);
    assert.equal(
      echecCgal([
        'WARNING: Viewall and autocenter disabled',
        '   Status:     NoError',
      ]),
      null,
    );
  });
});
