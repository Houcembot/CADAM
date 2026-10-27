"""STL → PNG (vue 3/4 face, ombrée), proche de l'aperçu cadam. Usage : rendu.py entrée.stl sortie.png"""
import sys, numpy as np, matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d.art3d import Poly3DCollection
from stl import mesh
m = mesh.Mesh.from_file(sys.argv[1]); v = m.vectors
n = np.cross(v[:, 1] - v[:, 0], v[:, 2] - v[:, 0]); n /= np.linalg.norm(n, axis=1, keepdims=True) + 1e-12
lum = np.clip(n @ np.array([0.4, -0.6, 0.7]) / np.linalg.norm([0.4, -0.6, 0.7]), 0, 1) * 0.7 + 0.3
fig = plt.figure(figsize=(5.12, 5.12), dpi=100); ax = fig.add_subplot(projection="3d")
ax.add_collection3d(Poly3DCollection(v, facecolors=np.stack([lum * 0.75, lum * 0.8, lum * 0.9], 1), edgecolor="none"))
lo, hi = v.reshape(-1, 3).min(0), v.reshape(-1, 3).max(0); c = (lo + hi) / 2; r = (hi - lo).max() / 2
ax.set_xlim(c[0] - r, c[0] + r); ax.set_ylim(c[1] - r, c[1] + r); ax.set_zlim(c[2] - r, c[2] + r)
ax.set_box_aspect((1, 1, 1)); ax.view_init(elev=20, azim=-60); ax.set_axis_off()
fig.savefig(sys.argv[2], bbox_inches="tight", facecolor="white")
