// Pose le maillage compilé sur le plateau (z min = 0) : le prompt le demande,
// mais l'IA laisse parfois la pièce sous le plateau ou au-dessus. Le même
// décalage s'applique au STL (binaire ou ASCII) et au OFF coloré de l'aperçu.

const estBinaire = (b: Uint8Array) =>
  b.length >= 84 &&
  84 + 50 * new DataView(b.buffer, b.byteOffset).getUint32(80, true) ===
    b.length;

const arrondi = (x: number) => String(+x.toFixed(6));

const VERTEX = /^(\s*vertex\s+\S+\s+\S+\s+)(\S+)/gm;

function zMin(stl: Uint8Array): number {
  let min = Infinity;
  if (estBinaire(stl)) {
    const v = new DataView(stl.buffer, stl.byteOffset);
    const n = v.getUint32(80, true);
    for (let i = 0; i < n; i++)
      for (let k = 0; k < 3; k++)
        min = Math.min(min, v.getFloat32(84 + i * 50 + 20 + k * 12, true));
    return min;
  }
  for (const m of new TextDecoder().decode(stl).matchAll(VERTEX))
    min = Math.min(min, Number(m[2]));
  return min;
}

function decalerStl(stl: Uint8Array, dz: number): Uint8Array {
  if (estBinaire(stl)) {
    const copie = stl.slice();
    const v = new DataView(copie.buffer);
    const n = v.getUint32(80, true);
    for (let i = 0; i < n; i++)
      for (let k = 0; k < 3; k++) {
        const o = 84 + i * 50 + 20 + k * 12;
        v.setFloat32(o, v.getFloat32(o, true) + dz, true);
      }
    return copie;
  }
  const t = new TextDecoder()
    .decode(stl)
    .replace(VERTEX, (_, debut, z) => debut + arrondi(Number(z) + dz));
  return new TextEncoder().encode(t);
}

function decalerOff(off: Uint8Array, dz: number): Uint8Array {
  const lignes = new TextDecoder().decode(off).split('\n');
  const entete = lignes[0].trim().split(/\s+/);
  // « OFF nv nf ne » sur une ligne (OpenSCAD), ou « OFF » puis les comptes.
  const debut = entete.length > 1 ? 1 : 2;
  const nv = Number(
    entete.length > 1 ? entete[1] : lignes[1].trim().split(/\s+/)[0],
  );
  for (let i = debut; i < debut + nv; i++) {
    const c = lignes[i].trim().split(/\s+/);
    c[2] = arrondi(Number(c[2]) + dz);
    lignes[i] = c.join(' ');
  }
  return new TextEncoder().encode(lignes.join('\n'));
}

export function poserSurPlateau(
  stl: Uint8Array,
  off?: Uint8Array,
): { stl: Uint8Array; off?: Uint8Array; dz: number } {
  const min = zMin(stl);
  if (!Number.isFinite(min) || Math.abs(min) < 1e-6) return { stl, off, dz: 0 };
  const dz = -min;
  return {
    stl: decalerStl(stl, dz),
    off: off && decalerOff(off, dz),
    dz,
  };
}
