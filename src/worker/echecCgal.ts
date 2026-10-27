// Une erreur CGAL n'arrête pas OpenSCAD : le code de sortie reste 0, mais
// l'objet fautif est abandonné et la pièce sort incomplète. On la traite
// comme un échec de compilation, pour que l'IA reçoive l'erreur et refasse
// la pièce (la continuation n'est pas facturée).
export function echecCgal(stdErr: string[]): string | null {
  const ligne = stdErr.find((l) => /^ERROR: CGAL error/.test(l.trim()));
  if (!ligne) return null;
  if (/applyHull/.test(ligne))
    return (
      'A hull() failed in the OpenSCAD engine (CGAL error in applyHull), so that shape was dropped and the model is incomplete. ' +
      'Rebuild it without hull() over spheres: for rounded boxes use BOSL2 cuboid([x, y, z], rounding=r).\n' +
      ligne.trim()
    );
  return (
    'The OpenSCAD engine hit a CGAL error, so part of the geometry was dropped and the model is incomplete. Simplify or rewrite the failing operation.\n' +
    ligne.trim()
  );
}
