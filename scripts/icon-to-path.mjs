// Vectorise a flat icon PNG into an SVG path you can inline in the app.
//
//   node scripts/icon-to-path.mjs <png> [epsilon] [--lines]
//
// A 50px source traced directly gives a staircase on every diagonal, which is
// ugly in a 22px button. So the mask is first blown up 8x with bicubic
// interpolation - the interpolated edge is a sub-pixel, anti-aliased curve -
// and the contour is traced at that resolution, decimated, then rounded with
// two Chaikin corner-cutting passes (which never overshoots, unlike a spline
// fitted to a few points). Coordinates are written back in the source's pixel
// space, so the emitted path keeps the original viewBox.
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const args = process.argv.slice(2);
const file = args[0];
const eps = Number(args[1] || 0.5);
if (!file) { console.error('usage: icon-to-path.mjs <png> [epsilon]'); process.exit(2); }

const py = `
import json, math
import numpy as np
from PIL import Image
from skimage.measure import find_contours, approximate_polygon

S = 8          # supersample factor
im = Image.open(${JSON.stringify(file)}).convert('RGBA')
a = np.asarray(im).astype(float)
alpha, rgb = a[..., 3] / 255.0, a[..., :3].mean(axis=2) / 255.0
ink = np.where(alpha > 0.02, 1.0 - rgb, 0.0) * alpha
if alpha.min() > 0.9:
    ink = 1.0 - rgb                      # black-on-white export
ink = np.clip(ink, 0.0, 1.0)
big = np.asarray(Image.fromarray(ink.astype('float32'), mode='F').resize(
    (ink.shape[1] * S, ink.shape[0] * S), Image.BICUBIC), dtype=float)
mask = (big > 0.5).astype(float)
# Two pixels of "paper" at the edge stop find_contours tracing the frame.
mask = np.pad(mask, 2 * S)

def dedupe(pts, tol):
    out = []
    for p in pts:
        if out and abs(p[0] - out[-1][0]) < tol and abs(p[1] - out[-1][1]) < tol:
            continue
        out.append(p)
    while len(out) > 2 and abs(out[0][0] - out[-1][0]) < tol and abs(out[0][1] - out[-1][1]) < tol:
        out.pop()
    return out

def chaikin(pts, passes=2):
    for _ in range(passes):
        n, out = len(pts), []
        for i in range(n):
            p0, p1 = pts[i], pts[(i + 1) % n]
            out.append((p0[0] * 0.75 + p1[0] * 0.25, p0[1] * 0.75 + p1[1] * 0.25))
            out.append((p0[0] * 0.25 + p1[0] * 0.75, p0[1] * 0.25 + p1[1] * 0.75))
        pts = out
    return pts

subs, info = [], []
for c in find_contours(mask, 0.5):
    if len(c) < 8:
        continue
    simple = dedupe(approximate_polygon(c, ${eps} * S).tolist(), 2.0)
    if len(simple) < 3:
        continue
    ys = [p[0] for p in simple]; xs = [p[1] for p in simple]
    span = max(max(ys) - min(ys), max(xs) - min(xs)) / S
    area = 0.5 * abs(sum(ys[i] * xs[i + 1] - xs[i] * ys[i + 1] for i in range(len(simple) - 1))
                     + xs[0] * ys[-1] - ys[0] * xs[-1]) / (S * S)
    if span <= 7 and area <= 40:
        cy, cx = np.mean(ys) / S, np.mean(xs) / S
        r = max(math.sqrt(2 * np.mean([((y / S) - cy) ** 2 + ((x / S) - cx) ** 2 for y, x in simple])), 0.9)
        subs.append([['M', cx - r, cy], ['A', r, r, 0, 1, 0, cx + r, cy],
                     ['A', r, r, 0, 1, 0, cx - r, cy], ['Z']])
        info.append(['circle', round(cx, 1), round(cy, 1), round(r, 1)])
        continue
    pts = [(p[1] / S, p[0] / S) for p in chaikin(simple)]
    d = [['M', pts[0][0], pts[0][1]]] + [['L', x, y] for x, y in pts[1:]] + [['Z']]
    subs.append(d)
    info.append(['poly', len(pts), round(span, 1), round(area, 1)])

def fmt(v):
    v = round(float(v), 1)
    return str(int(v)) if abs(v - round(v)) < 0.05 else str(v)

path = ' '.join(
    ' '.join(sg[0] + ' ' + ' '.join(fmt(v) for v in sg[1:]) for sg in sub) for sub in subs
).strip()
print(json.dumps({'path': path, 'subpaths': len(subs), 'info': info}))
`;

fs.writeFileSync('/tmp/_trace4.py', py);
const out = JSON.parse(execSync(`python3 /tmp/_trace4.py`, { encoding: 'utf8' }));
console.log(`// ${out.subpaths} subpath(s) ${JSON.stringify(out.info)} · ${out.path.length} bytes`);
console.log(JSON.stringify(out.path));
