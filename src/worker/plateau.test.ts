import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { poserSurPlateau } from './plateau.ts';

// 26/10/2026 : banc interne, 3 pièces sur 8 générées sous le plateau
// (z min −9, −10, −85 mm) malgré la règle du prompt. Le worker recale
// désormais le maillage compilé : z min = 0 pour l'aperçu et l'export.
const ascii = (zs: number[]) =>
  new TextEncoder().encode(
    'solid OpenSCAD_Model\n  facet normal 0 0 1\n    outer loop\n' +
      zs.map((z, i) => `      vertex ${i} 2 ${z}\n`).join('') +
      '    endloop\n  endfacet\nendsolid OpenSCAD_Model\n',
  );

const binaire = (zs: number[]) => {
  const b = new Uint8Array(84 + 50);
  const v = new DataView(b.buffer);
  v.setUint32(80, 1, true);
  v.setFloat32(84, 0, true);
  v.setFloat32(88, 0, true);
  v.setFloat32(92, 1, true);
  zs.forEach((z, k) => {
    v.setFloat32(96 + k * 12, k, true);
    v.setFloat32(100 + k * 12, 2, true);
    v.setFloat32(104 + k * 12, z, true);
  });
  return b;
};

const zBinaire = (b: Uint8Array) => {
  const v = new DataView(b.buffer, b.byteOffset);
  return [0, 1, 2].map((k) => v.getFloat32(104 + k * 12, true));
};

const off = (zs: number[]) =>
  new TextEncoder().encode(
    `OFF ${zs.length} 1 0\n` +
      zs.map((z, i) => `${i} 2 ${z} \n`).join('') +
      '3 0 1 2 255 0 0\n',
  );

const texte = (b?: Uint8Array) => new TextDecoder().decode(b);

describe('poserSurPlateau', () => {
  it('remonte un STL ASCII sous le plateau', () => {
    const r = poserSurPlateau(ascii([-9, -4, 1]));
    assert.match(texte(r.stl), /vertex 0 2 0\n/);
    assert.match(texte(r.stl), /vertex 1 2 5\n/);
    assert.match(texte(r.stl), /vertex 2 2 10\n/);
    assert.equal(r.dz, 9);
  });

  it('descend un STL binaire qui flotte au-dessus du plateau', () => {
    const r = poserSurPlateau(binaire([3, 5, 8]));
    assert.deepEqual(zBinaire(r.stl), [0, 2, 5]);
    assert.equal(r.dz, -3);
  });

  it('décale le OFF coloré du même z, sans toucher aux faces', () => {
    const r = poserSurPlateau(ascii([-10, 0, 0]), off([-10, -2, 4]));
    assert.equal(
      texte(r.off),
      'OFF 3 1 0\n0 2 0\n1 2 8\n2 2 14\n3 0 1 2 255 0 0\n',
    );
  });

  it('ne réécrit rien quand la pièce est déjà posée', () => {
    const stl = ascii([0, 3, 7]);
    const o = off([0, 3, 7]);
    const r = poserSurPlateau(stl, o);
    assert.equal(r.stl, stl);
    assert.equal(r.off, o);
    assert.equal(r.dz, 0);
  });

  it('laisse passer une sortie qui n’est pas un maillage (SVG)', () => {
    const svg = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg"/>',
    );
    assert.equal(poserSurPlateau(svg).stl, svg);
  });
});
