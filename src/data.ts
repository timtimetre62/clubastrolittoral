// Chargement des données du ciel (préparées par scripts/build-data.mjs).
import { vecRaDec, type Vec3 } from './astro';

export interface Etoiles {
  n: number;
  vec: Float64Array; // x,y,z J2000
  ra: Float32Array;
  dec: Float32Array;
  mag: Float32Array;
  bv: Float32Array;
  hip: Int32Array;
}

export interface Constellation {
  id: string;
  fr: string;
  la: string;
  gen: string;
  rank: number;
  pos: [number, number];
  posV: Vec3;
  lines: [number, number][][];
  linesV: Vec3[][];
}

export type NomEtoile = [string, string, string, string]; // nom propre, bayer, flamsteed, constellation

export interface DonneesCiel {
  etoiles: Etoiles;
  noms: Record<string, NomEtoile>;
  constellations: Constellation[];
}

const url = (f: string) => new URL(`data/${f}`, document.baseURI).href;

export async function chargerDonnees(): Promise<DonneesCiel> {
  const [raw, noms, cons] = await Promise.all([
    fetch(url('stars.json')).then((r) => r.json()) as Promise<number[][]>,
    fetch(url('starnames.json')).then((r) => r.json()) as Promise<Record<string, NomEtoile>>,
    fetch(url('constellations.json')).then((r) => r.json()) as Promise<Omit<Constellation, 'posV' | 'linesV'>[]>,
  ]);
  const n = raw.length;
  const e: Etoiles = {
    n,
    vec: new Float64Array(n * 3),
    ra: new Float32Array(n),
    dec: new Float32Array(n),
    mag: new Float32Array(n),
    bv: new Float32Array(n),
    hip: new Int32Array(n),
  };
  raw.forEach(([ra, dec, mag, bv, hip], i) => {
    const v = vecRaDec(ra, dec);
    e.vec[i * 3] = v[0]; e.vec[i * 3 + 1] = v[1]; e.vec[i * 3 + 2] = v[2];
    e.ra[i] = ra; e.dec[i] = dec; e.mag[i] = mag; e.bv[i] = bv; e.hip[i] = hip;
  });
  const constellations = cons.map((c) => ({
    ...c,
    posV: vecRaDec(c.pos[0], c.pos[1]),
    linesV: c.lines.map((l) => l.map(([ra, dec]) => vecRaDec(ra, dec))),
  }));
  return { etoiles: e, noms, constellations };
}

/** Nom lisible d'une étoile : nom propre, sinon lettre de Bayer + constellation. */
export function nomEtoile(d: DonneesCiel, hip: number, genitifs: Map<string, string>): string {
  const n = d.noms[hip];
  if (!n) return `HIP ${hip}`;
  const [propre, bayer, flam, c] = n;
  const des = bayer || flam ? `${bayer || flam} ${genitifs.get(c) ?? c}` : '';
  if (propre && des) return `${propre} (${des})`;
  return propre || des || `HIP ${hip}`;
}

/** Couleur approximative d'une étoile d'après son indice B-V. */
export function couleurBV(bv: number): string {
  const t = Math.max(-0.4, Math.min(2, bv));
  // Bleu (-0.4) -> blanc (0.4) -> jaune-orangé (1.2) -> orange-rouge (2)
  const stops: [number, number[]][] = [
    [-0.4, [155, 176, 255]], [0, [202, 215, 255]], [0.4, [255, 255, 255]],
    [0.8, [255, 244, 220]], [1.2, [255, 215, 160]], [2, [255, 170, 110]],
  ];
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [t0, c0] = stops[i - 1], [t1, c1] = stops[i];
      const f = (t - t0) / (t1 - t0);
      const c = c0.map((x, k) => Math.round(x + (c1[k] - x) * f));
      return `rgb(${c[0]},${c[1]},${c[2]})`;
    }
  }
  return 'rgb(255,170,110)';
}
