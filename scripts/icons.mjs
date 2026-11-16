// Génère les icônes PNG à partir de public/icons/icon.svg (nécessite Playwright).
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { readFileSync } from 'node:fs';
const svg = readFileSync(new URL('../public/icons/icon.svg', import.meta.url), 'utf8');
const b = await chromium.launch();
for (const s of [180, 192, 512]) {
  const p = await b.newPage({ viewport: { width: s, height: s } });
  await p.setContent(`<style>body{margin:0}svg{width:${s}px;height:${s}px;display:block}</style>${svg}`);
  await p.screenshot({ path: new URL(`../public/icons/icon-${s}.png`, import.meta.url).pathname });
}
await b.close();
