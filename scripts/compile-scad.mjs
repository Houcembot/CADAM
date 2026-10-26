// Compile un .scad avec le même OpenSCAD wasm que cadam ; écrit l'STL et affiche la boîte englobante.
// Usage : node scripts/compile-scad.mjs <entrée.scad> <sortie.stl>
import fs from 'fs'; import os from 'os'; import path from 'path'; import { execSync } from 'child_process'
import { fileURLToPath } from 'url'
import OpenSCAD from '../src/vendor/openscad-wasm/openscad.js'
const racine = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const [scad, stl] = process.argv.slice(2)
const code = fs.readFileSync(scad, 'utf8')
const err = []
const inst = await OpenSCAD({ noInitialRun: true, wasmBinary: fs.readFileSync(path.join(racine, 'src/vendor/openscad-wasm/openscad.wasm')), print: () => {}, printErr: t => err.push(t) })
inst.FS.mkdir('/libraries')
const copie = (src, dst) => { for (const f of fs.readdirSync(src)) { const s = path.join(src, f), d = dst + '/' + f; if (fs.statSync(s).isDirectory()) { inst.FS.mkdir(d); copie(s, d) } else inst.FS.writeFile(d, fs.readFileSync(s)) } }
for (const l of ['BOSL2', 'BOSL', 'MCAD']) if (code.includes(l)) {
  const dir = path.join(os.tmpdir(), 'cadam-libs', l)
  if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); execSync(`unzip -qo ${path.join(racine, 'public/libraries', l + '.zip')} -d ${dir}`) }
  inst.FS.mkdir('/libraries/' + l); copie(dir, '/libraries/' + l)
}
inst.FS.writeFile('/input.scad', code)
const t0 = Date.now()
let rc; try { rc = inst.callMain(['/input.scad', '-o', '/out.stl', '--export-format=binstl']) } catch (e) { rc = 'exception ' + e }
const out = { rc, ms: Date.now() - t0, erreurs: err.filter(l => /ERROR|WARNING: (Ignoring unknown|undefined)/i.test(l)).slice(0, 5) }
try {
  const b = inst.FS.readFile('/out.stl'); fs.writeFileSync(stl, b)
  const v = new DataView(b.buffer, b.byteOffset); const n = v.getUint32(80, true); const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) for (let a = 0; a < 3; a++) { const x = v.getFloat32(84 + i * 50 + 12 + k * 12 + a * 4, true); if (x < mn[a]) mn[a] = x; if (x > mx[a]) mx[a] = x }
  out.triangles = n; out.dims = mx.map((x, a) => +(x - mn[a]).toFixed(1)); out.zmin = +mn[2].toFixed(2)
} catch { out.stl = 'absent' }
console.log(JSON.stringify(out))
