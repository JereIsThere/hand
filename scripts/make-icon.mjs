// Generiert build/icon.ico aus einer Vektor-Hand (SVG-Pfade, keine Emoji-Font
// nötig -> rendert überall gleich). Einmalig laufen lassen: `npm run make-icon`.
// Das Ergebnis (build/icon.ico) wird committet; dieses Script ist nur Quelle.
import { Resvg } from '@resvg/resvg-js';
import pngToIco from 'png-to-ico';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'build');
fs.mkdirSync(outDir, { recursive: true });

// Die Hand: dunkler Codex-Hintergrund + stilisierte helle Hand (Palme + 4 Finger
// + Daumen als abgerundete Formen), Akzent cyan→gold passend zum Auge-Look.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0b0418"/>
      <stop offset="1" stop-color="#06000e"/>
    </linearGradient>
    <linearGradient id="hand" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#00d4c8"/>
      <stop offset="1" stop-color="#d4a200"/>
    </linearGradient>
  </defs>
  <rect width="256" height="256" rx="56" fill="url(#bg)"/>
  <rect width="256" height="256" rx="56" fill="none" stroke="#1d1330" stroke-width="3"/>
  <g fill="url(#hand)">
    <!-- Palme -->
    <rect x="86" y="120" width="84" height="86" rx="34"/>
    <!-- 4 Finger -->
    <rect x="92"  y="70" width="20" height="78" rx="10"/>
    <rect x="116" y="58" width="20" height="92" rx="10"/>
    <rect x="140" y="62" width="20" height="88" rx="10"/>
    <rect x="164" y="78" width="20" height="74" rx="10"/>
    <!-- Daumen -->
    <rect x="70" y="128" width="20" height="58" rx="10" transform="rotate(38 80 157)"/>
  </g>
</svg>`;

const sizes = [256, 128, 64, 48, 32, 16];
const pngs = sizes.map((size) => {
  const r = new Resvg(svg, { fitTo: { mode: 'width', value: size } });
  return Buffer.from(r.render().asPng());
});

const ico = await pngToIco(pngs);
const out = path.join(outDir, 'icon.ico');
fs.writeFileSync(out, ico);
console.log(`icon.ico geschrieben (${ico.length} bytes) -> ${out}`);
