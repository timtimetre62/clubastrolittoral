// Prépare les données du ciel (étoiles, constellations) dans un format compact
// à partir du paquet d3-celestial (licence BSD, © Olaf Frohn).
// Sortie : public/data/*.json
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const src = join(dirname(require.resolve('d3-celestial/package.json')), 'data');
const out = new URL('../public/data/', import.meta.url);
mkdirSync(out, { recursive: true });

const read = (f) => JSON.parse(readFileSync(join(src, f), 'utf8'));
const ra = (lon) => (lon < 0 ? lon + 360 : lon);
const r = (x, d) => Math.round(x * 10 ** d) / 10 ** d;

// Étoiles jusqu'à la magnitude 8 : [ra°, dec°, mag, B-V, hip]
const names = read('starnames.json');
const stars = read('stars.8.json').features
  .map((f) => {
    const [lon, lat] = f.geometry.coordinates;
    return [r(ra(lon), 4), r(lat, 4), f.properties.mag, r(parseFloat(f.properties.bv) || 0, 2), f.id];
  })
  .sort((a, b) => a[2] - b[2]);
writeFileSync(new URL('stars.json', out), JSON.stringify(stars));

// Noms d'étoiles : hip -> [nom, bayer, flamsteed, constellation]
const starNames = {};
for (const [hip, n] of Object.entries(names)) {
  if (n.name || n.bayer || n.flam) starNames[hip] = [n.name || '', n.bayer || '', n.flam || '', n.c || ''];
}
writeFileSync(new URL('starnames.json', out), JSON.stringify(starNames));

// Constellations : abréviation -> { nom FR, nom latin, génitif, position du nom, lignes }
const lines = Object.fromEntries(read('constellations.lines.json').features.map((f) => [f.id, f.geometry.coordinates]));
const cons = read('constellations.json').features.map((f) => ({
  id: f.id,
  fr: f.properties.fr || f.properties.name,
  la: f.properties.name,
  gen: f.properties.gen,
  rank: Number(f.properties.rank),
  pos: [r(ra(f.geometry.coordinates[0]), 3), r(f.geometry.coordinates[1], 3)],
  lines: (lines[f.id] || []).map((l) => l.map(([lo, la]) => [r(ra(lo), 3), r(la, 3)])),
}));
writeFileSync(new URL('constellations.json', out), JSON.stringify(cons));

console.log(`données : ${stars.length} étoiles, ${Object.keys(starNames).length} noms, ${cons.length} constellations`);
