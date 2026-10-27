import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

// 27/10/2026 : vraie génération en prod (figurine Jett) — les boîtes
// arrondies faites par hull() de 8 sphères plantent dans le CGAL du wasm
// (« applyHull ») pour beaucoup de $fn (16, 30, 40, 48, 96…) : corps, jambes
// et tête perdus. Les arrondis passent par BOSL2 cuboid(rounding=).
const src = readFileSync(
  new URL('../src/server/aiChat.ts', import.meta.url),
  'utf8',
);
const regles = src.slice(src.indexOf('# OpenSCAD code rules'));

describe('prompt cadam — arrondis', () => {
  it('impose cuboid(rounding=) de BOSL2 pour les boîtes arrondies', () => {
    assert.match(regles, /cuboid\(\[x, y, z\], rounding=r/);
  });

  it('interdit le hull() de sphères', () => {
    assert.match(regles, /never build them with hull\(\) over spheres/i);
  });
});
