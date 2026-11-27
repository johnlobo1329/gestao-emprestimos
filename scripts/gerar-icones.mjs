// Gera os ícones do PWA em /public/icons usando "sharp" (já vem com o Next.js).
// Uso:  node scripts/gerar-icones.mjs
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

mkdirSync('public/icons', { recursive: true });

// "full": usado em iPhone (apple-touch-icon) e ícones normais. O iOS arredonda sozinho,
//         por isso o fundo vai de ponta a ponta (sem cantos transparentes).
// "safe": maskable do Android: o desenho fica dentro da "zona segura" central (80%).
const svg = (escala) => `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#000000"/>
  <g transform="translate(256 256) scale(${escala}) translate(-256 -256)">
    <rect x="96" y="150" width="320" height="212" rx="48" fill="#1C1C1E" stroke="#30D158" stroke-width="14"/>
    <rect x="96" y="196" width="320" height="30" fill="#30D158" opacity="0.9"/>
    <text x="256" y="324" text-anchor="middle" font-family="Arial, Helvetica, sans-serif"
          font-weight="700" font-size="92" fill="#FFFFFF">R$</text>
  </g>
</svg>`;

const alvos = [
  { arquivo: 'icon-192.png',          tam: 192, escala: 1.0 },
  { arquivo: 'icon-512.png',          tam: 512, escala: 1.0 },
  { arquivo: 'icon-maskable-512.png', tam: 512, escala: 0.78 },
  { arquivo: 'apple-touch-icon.png',  tam: 180, escala: 1.0 },
];

for (const a of alvos) {
  await sharp(Buffer.from(svg(a.escala))).resize(a.tam, a.tam).png().toFile(`public/icons/${a.arquivo}`);
  console.log('ok  public/icons/' + a.arquivo);
}
