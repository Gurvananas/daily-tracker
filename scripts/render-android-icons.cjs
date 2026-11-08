// Regenerate the Android launcher icons and splash screens from the app icon:
//   node scripts/render-android-icons.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const res = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');
const BLUE = '#2a78d6';
const cells = [[0, 0, 0.35], [1, 0, 0.6], [2, 0, 1], [0, 1, 0.6], [1, 1, 1], [2, 1, 0.35], [0, 2, 1], [1, 2, 0.6], [2, 2, 1]];
const grid = (size, color = '#fff') => {
  const cell = size * 84 / 320;
  const gap = size * 34 / 320;
  return cells.map(([x, y, o]) => `<rect x="${x * (cell + gap)}" y="${y * (cell + gap)}" width="${cell}" height="${cell}" rx="${cell * 0.24}" fill="${color}" opacity="${o}"/>`).join('');
};
// content: 512 canvas, grid 320 wide centered
const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
const centeredGrid = (w, h, g) => `<g transform="translate(${(w - g) / 2} ${(h - g) / 2})">${grid(g)}</g>`;

const jobs = [];
for (const [dpi, s] of Object.entries({ mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 })) {
  jobs.push([`mipmap-${dpi}/ic_launcher.png`, s, s, svg(s, s, `<rect width="${s}" height="${s}" rx="${s * 0.22}" fill="${BLUE}"/>${centeredGrid(s, s, s * 0.625)}`)]);
  jobs.push([`mipmap-${dpi}/ic_launcher_round.png`, s, s, svg(s, s, `<circle cx="${s / 2}" cy="${s / 2}" r="${s / 2}" fill="${BLUE}"/>${centeredGrid(s, s, s * 0.5)}`)]);
  const f = s * 108 / 48;
  jobs.push([`mipmap-${dpi}/ic_launcher_foreground.png`, f, f, svg(f, f, centeredGrid(f, f, f * 0.42))]);
}
const splashes = fs.readdirSync(res).filter((d) => d.startsWith('drawable')).filter((d) => fs.existsSync(path.join(res, d, 'splash.png')));
for (const d of splashes) {
  const buf = fs.readFileSync(path.join(res, d, 'splash.png'));
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  const s = Math.round(Math.min(w, h) * 0.28);
  const body = `<rect width="${w}" height="${h}" fill="#f9f9f7"/><g transform="translate(${(w - s) / 2} ${(h - s) / 2})"><rect width="${s}" height="${s}" rx="${s * 0.22}" fill="${BLUE}"/>${centeredGrid(s, s, s * 0.625)}</g>`;
  jobs.push([`${d}/splash.png`, w, h, svg(w, h, body)]);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const [out, w, h, markup] of jobs) {
    await page.setViewportSize({ width: Math.ceil(w), height: Math.ceil(h) });
    await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block}</style>${markup}`);
    await page.locator('svg').screenshot({ path: path.join(res, out), omitBackground: true });
  }
  await browser.close();
  console.log(`${jobs.length} images écrites`);
})();
