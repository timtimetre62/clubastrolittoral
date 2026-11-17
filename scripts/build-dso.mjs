// Prépare le catalogue des objets du ciel profond (public/data/dso.json).
//
// Source : catalogue DSO de Stellarium (version épinglée ci-dessous), compilé par
// l'équipe Stellarium à partir de SIMBAD, NED et des catalogues d'origine
// (NGC/IC, Messier, Caldwell, Barnard, Sharpless, LDN, LBN, van den Bergh,
// Collinder, Melotte, Arp, PK…). Licence GPL-2.0-or-later.
// On ne garde que les objets présents dans au moins un catalogue « d'observation ».
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';

const COMMIT = 'ed5a51a1e52c55b352d1037fcdd8c4e22f0ca402';
const BASE = `https://raw.githubusercontent.com/Stellarium/stellarium/${COMMIT}/nebulae/default/`;
const cache = new URL('../.cache/', import.meta.url);
const out = new URL('../public/data/', import.meta.url);
mkdirSync(cache, { recursive: true });
mkdirSync(out, { recursive: true });

async function charger(fichier) {
  const local = new URL(`stellarium-${COMMIT.slice(0, 8)}-${fichier}`, cache);
  if (!existsSync(local)) {
    const r = await fetch(BASE + fichier);
    if (!r.ok) throw new Error(`${fichier} : HTTP ${r.status}`);
    writeFileSync(local, Buffer.from(await r.arrayBuffer()));
  }
  return readFileSync(local, 'utf8');
}

// Colonnes (index 0) du catalogue Stellarium et préfixe affiché.
const CATS = [
  ['M', 18, 'M'], ['C', 19, 'C'], ['NGC', 16, 'NGC'], ['IC', 17, 'IC'], ['Sh2', 21, 'Sh2-'],
  ['B', 20, 'B'], ['LDN', 24, 'LDN'], ['LBN', 25, 'LBN'], ['VdB', 22, 'vdB'], ['RCW', 23, 'RCW'],
  ['Ced', 30, 'Ced'], ['Cr', 26, 'Cr'], ['Mel', 27, 'Mel'], ['Tr', 41, 'Tr'], ['St', 42, 'St'],
  ['Ru', 43, 'Ru'], ['Arp', 31, 'Arp'], ['PK', 33, 'PK'],
];

// Types Stellarium -> famille utilisée par l'appli
const FAMILLE = {
  gal: ['G', 'Gx', 'AGx', 'rG', 'IG', 'IG2', 'IG3', 'QSO', 'Bla', 'BLL', 'GiG', 'PoG', 'Q?', 'RG', 'CGG', 'GxCL'],
  gc: ['GC'],
  oc: ['OC', 'Cl', 'CL', 'OpC', 'SA', 'SC', 'MGr', 'PoC'],
  cn: ['C+N'],
  neb: ['NB', 'HII', 'EN', 'BN', 'RN', 'RNe', 'HA', 'ISM', 'GNe', 'EmO', 'REG', 'SFR', 'bub', 'CGb'],
  pn: ['PN', 'PN?', 'PPN', 'PNB'],
  dn: ['DN', 'DNe', 'MoC'],
  snr: ['SNR', 'SNRG', 'SR?'],
};
const familleDe = {};
for (const [f, ts] of Object.entries(FAMILLE)) for (const t of ts) familleDe[t] = f;

const num = (s) => {
  const x = parseFloat(s);
  return Number.isFinite(x) ? x : 0;
};
const r = (x, d) => Math.round(x * 10 ** d) / 10 ** d;

const catalogue = await charger('catalog.txt');
const nomsTxt = await charger('names.dat');

// Noms propres (anglais) : préfixe + id -> premier nom « WK » ou le premier venu
const noms = new Map();
for (const l of nomsTxt.split('\n')) {
  if (!l || l.startsWith('#')) continue;
  const pre = l.slice(0, 5).trim().toUpperCase(), id = l.slice(5, 20).trim();
  const m = l.slice(20).match(/_\("(.+?)"\)/);
  if (!m) continue;
  const cle = `${pre} ${id}`;
  const wk = /#.*\bWK\b/.test(l);
  const prec = noms.get(cle);
  if (!prec || (wk && !prec.wk)) noms.set(cle, { nom: m[1], wk });
}

const nomsFr = JSON.parse(readFileSync(new URL('./noms-fr.json', import.meta.url), 'utf8'));
const objets = [];
for (const l of catalogue.split('\n')) {
  if (!l || l.startsWith('#')) continue;
  const c = l.split('\t');
  const ids = [];
  for (const [cat, i, pre] of CATS) {
    const v = (c[i] ?? '').trim();
    if (v && v !== '0') ids.push([cat, pre === 'PK' ? `PK ${v}` : `${pre}${pre.endsWith('-') ? '' : ' '}${v}`, v]);
  }
  if (!ids.length) continue;
  const type = c[5].trim();
  const famille = familleDe[type] ?? 'autre';
  if (famille === 'autre' && !ids.some(([k]) => k === 'M' || k === 'C')) continue; // étoiles isolées, objets douteux
  const bmag = num(c[3]), vmag = num(c[4]);
  let mag = vmag && vmag < 30 ? vmag : bmag && bmag < 30 ? bmag : 99;
  if (famille === 'dn') mag = 99; // pour les nébuleuses obscures, la « magnitude » est une opacité
  let nom = '';
  for (const [, label] of ids) {
    if (nomsFr[label]) { nom = nomsFr[label]; break; }
  }
  for (const [cat, , v] of nom ? [] : ids) {
    const n = noms.get(`${cat.toUpperCase()} ${v}`);
    if (n) { nom = n.nom; break; }
  }
  objets.push({
    ra: r(num(c[1]), 4), dec: r(num(c[2]), 4), mag: r(mag, 1), type, famille,
    maj: r(num(c[7]), 2), min: r(num(c[8]), 2), pa: Math.round(num(c[9])),
    morpho: c[6].trim(), ids: ids.map(([cat, label]) => [cat, label]), nom,
  });
}

// Format compact : [ra, dec, mag, famille, type, maj, min, pa, "cat:label|…", nom, morpho]
const compact = objets.map((o) => [
  o.ra, o.dec, o.mag, o.famille, o.type, o.maj, o.min, o.pa,
  o.ids.map(([c, l]) => `${c}:${l}`).join('|'), o.nom, o.morpho,
]);
writeFileSync(new URL('dso.json', out), JSON.stringify(compact));
const parCat = {};
for (const o of objets) for (const [c] of o.ids) parCat[c] = (parCat[c] ?? 0) + 1;
console.log(`ciel profond : ${objets.length} objets`, parCat);
