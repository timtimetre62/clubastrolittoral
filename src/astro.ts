// Calculs astronomiques : changement de repère, positions des corps, éphémérides.
// S'appuie sur astronomy-engine (précision de l'ordre de la seconde d'arc pour
// les planètes, précession, nutation et aberration incluses).
import * as A from 'astronomy-engine';

export type Vec3 = [number, number, number];
export type Mat3 = number[][]; // 3x3, lignes

export interface Lieu {
  lat: number; // degrés, +N
  lon: number; // degrés, +E
  alt: number; // mètres
  nom?: string;
}

export const DEG = Math.PI / 180;

export function observateur(l: Lieu): A.Observer {
  return new A.Observer(l.lat, l.lon, l.alt);
}

/** Vecteur unitaire à partir d'ascension droite / déclinaison en degrés. */
export function vecRaDec(raDeg: number, decDeg: number): Vec3 {
  const ra = raDeg * DEG, de = decDeg * DEG;
  return [Math.cos(de) * Math.cos(ra), Math.cos(de) * Math.sin(ra), Math.sin(de)];
}

/**
 * Repère horizontal d'astronomy-engine : x = nord, y = ouest, z = zénith.
 * Azimut compté depuis le nord vers l'est.
 */
export function vecAzAlt(azDeg: number, altDeg: number): Vec3 {
  const az = azDeg * DEG, h = altDeg * DEG;
  return [Math.cos(h) * Math.cos(az), -Math.cos(h) * Math.sin(az), Math.sin(h)];
}

export function azAltDeVec(v: Vec3): { az: number; alt: number } {
  const alt = Math.asin(Math.max(-1, Math.min(1, v[2]))) / DEG;
  let az = Math.atan2(-v[1], v[0]) / DEG;
  if (az < 0) az += 360;
  return { az, alt };
}

export function mul(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

/**
 * Matrice J2000 (EQJ) -> horizontal du lieu, à la date donnée.
 * astronomy-engine stocke rot[i][j] tel que v'_j = sum_i rot[i][j] v_i ; on
 * la transpose pour avoir une matrice « lignes » classique.
 */
export function matriceEqjHor(date: Date, lieu: Lieu): Mat3 {
  const r = A.Rotation_EQJ_HOR(date, observateur(lieu)).rot;
  return [
    [r[0][0], r[1][0], r[2][0]],
    [r[0][1], r[1][1], r[2][1]],
    [r[0][2], r[1][2], r[2][2]],
  ];
}

/** Hauteur apparente en tenant compte de la réfraction atmosphérique moyenne. */
export function avecRefraction(altDeg: number): number {
  return altDeg + A.Refraction('normal', altDeg);
}

// ---------------------------------------------------------------- Corps du système solaire

export interface Corps {
  id: A.Body;
  nom: string;
  couleur: string;
}

export const CORPS: Corps[] = [
  { id: A.Body.Sun, nom: 'Soleil', couleur: '#ffe680' },
  { id: A.Body.Moon, nom: 'Lune', couleur: '#f2f2e6' },
  { id: A.Body.Mercury, nom: 'Mercure', couleur: '#c9b8a3' },
  { id: A.Body.Venus, nom: 'Vénus', couleur: '#fff4d1' },
  { id: A.Body.Mars, nom: 'Mars', couleur: '#ff8a5c' },
  { id: A.Body.Jupiter, nom: 'Jupiter', couleur: '#f5deb3' },
  { id: A.Body.Saturn, nom: 'Saturne', couleur: '#ead08f' },
  { id: A.Body.Uranus, nom: 'Uranus', couleur: '#b5e3e8' },
  { id: A.Body.Neptune, nom: 'Neptune', couleur: '#8fb3ff' },
];

export interface PositionCorps {
  corps: Corps;
  ra: number; // degrés, J2000 topocentrique
  dec: number;
  v: Vec3; // vecteur J2000
  mag: number;
  diametre: number; // secondes d'arc
  phase: number; // fraction éclairée 0..1
  angleLimbe?: number; // pour la Lune : angle de position du limbe éclairé (degrés)
}

const RAYON_KM: Partial<Record<A.Body, number>> = {
  [A.Body.Sun]: 695700, [A.Body.Moon]: 1737.4, [A.Body.Mercury]: 2439.7, [A.Body.Venus]: 6051.8,
  [A.Body.Mars]: 3389.5, [A.Body.Jupiter]: 69911, [A.Body.Saturn]: 58232, [A.Body.Uranus]: 25362,
  [A.Body.Neptune]: 24622,
};

export function positionsCorps(date: Date, lieu: Lieu): PositionCorps[] {
  const obs = observateur(lieu);
  const soleil = A.Equator(A.Body.Sun, date, obs, false, true);
  return CORPS.map((c) => {
    const eq = A.Equator(c.id, date, obs, false, true);
    const ra = eq.ra * 15, dec = eq.dec;
    const distKm = eq.dist * A.KM_PER_AU;
    const diametre = (2 * Math.atan((RAYON_KM[c.id] ?? 0) / distKm)) / DEG * 3600;
    let mag = -26.7, phase = 1, angleLimbe: number | undefined;
    if (c.id !== A.Body.Sun) {
      const ill = A.Illumination(c.id, date);
      mag = ill.mag;
      phase = ill.phase_fraction;
    }
    if (c.id === A.Body.Moon) {
      // Angle de position du point éclairé = direction du Soleil vue depuis la Lune
      const a1 = ra * DEG, d1 = dec * DEG, a0 = soleil.ra * 15 * DEG, d0 = soleil.dec * DEG;
      angleLimbe = Math.atan2(
        Math.cos(d0) * Math.sin(a0 - a1),
        Math.sin(d0) * Math.cos(d1) - Math.cos(d0) * Math.sin(d1) * Math.cos(a0 - a1),
      ) / DEG;
    }
    return { corps: c, ra, dec, v: vecRaDec(ra, dec), mag, diametre, phase, angleLimbe };
  });
}

// ---------------------------------------------------------------- Lever, culmination, coucher

export interface Evenements {
  lever: Date | null;
  culmination: Date | null;
  hauteurCulmination: number | null;
  coucher: Date | null;
  circumpolaire: boolean;
  jamaisLeve: boolean;
}

/** Lever / culmination / coucher dans les 24 h qui suivent `debut`. */
export function evenements(corps: A.Body, lieu: Lieu, debut: Date): Evenements {
  const obs = observateur(lieu);
  const lever = A.SearchRiseSet(corps, obs, +1, debut, 1);
  const coucher = A.SearchRiseSet(corps, obs, -1, debut, 1);
  const cul = A.SearchHourAngle(corps, obs, 0, debut, +1);
  const culDate = cul.time.date.getTime() - debut.getTime() < 86400e3 ? cul.time.date : null;
  const hCul = cul.hor.altitude;
  return {
    lever: lever?.date ?? null,
    coucher: coucher?.date ?? null,
    culmination: culDate,
    hauteurCulmination: culDate ? hCul : null,
    circumpolaire: !lever && !coucher && hCul > 0,
    jamaisLeve: !lever && !coucher && hCul <= 0,
  };
}

/** Même chose pour un objet fixe (étoile, galaxie…) donné en J2000. */
export function evenementsFixe(raDeg: number, decDeg: number, lieu: Lieu, debut: Date): Evenements {
  A.DefineStar(A.Body.Star1, raDeg / 15, decDeg, 1000);
  return evenements(A.Body.Star1, lieu, debut);
}

// ---------------------------------------------------------------- La nuit

export interface Nuit {
  coucherSoleil: Date | null;
  finCivil: Date | null;
  finNautique: Date | null;
  finAstro: Date | null;
  debutAstro: Date | null;
  debutNautique: Date | null;
  debutCivil: Date | null;
  leverSoleil: Date | null;
  lune: { lever: Date | null; coucher: Date | null; phase: number; age: number; nomPhase: string };
}

const NOMS_PHASES = [
  'Nouvelle Lune', 'Premier croissant', 'Premier quartier', 'Gibbeuse croissante',
  'Pleine Lune', 'Gibbeuse décroissante', 'Dernier quartier', 'Dernier croissant',
];

export function nomPhaseLune(angle: number): string {
  return NOMS_PHASES[Math.round(angle / 45) % 8];
}

/**
 * Les repères de la nuit qui suit `date` (à partir du midi local précédent,
 * pour que « ce soir » reste valable après minuit).
 */
export function nuit(date: Date, lieu: Lieu): Nuit {
  const obs = observateur(lieu);
  // Midi solaire local approximatif
  const midi = new Date(date);
  const decalageH = lieu.lon / 15;
  midi.setUTCHours(12 - decalageH, 0, 0, 0);
  if (midi.getTime() > date.getTime()) midi.setTime(midi.getTime() - 86400e3);
  const S = A.Body.Sun;
  const t = (x: A.AstroTime | null) => x?.date ?? null;
  const coucherSoleil = t(A.SearchRiseSet(S, obs, -1, midi, 1));
  const finCivil = t(A.SearchAltitude(S, obs, -1, midi, 1, -6));
  const finNautique = t(A.SearchAltitude(S, obs, -1, midi, 1, -12));
  const finAstro = t(A.SearchAltitude(S, obs, -1, midi, 1, -18));
  const apres = finAstro ?? finNautique ?? coucherSoleil ?? midi;
  const debutAstro = t(A.SearchAltitude(S, obs, +1, apres, 1, -18));
  const debutNautique = t(A.SearchAltitude(S, obs, +1, apres, 1, -12));
  const debutCivil = t(A.SearchAltitude(S, obs, +1, apres, 1, -6));
  const leverSoleil = t(A.SearchRiseSet(S, obs, +1, apres, 1));
  const angle = A.MoonPhase(date);
  const ill = A.Illumination(A.Body.Moon, date);
  return {
    coucherSoleil, finCivil, finNautique, finAstro, debutAstro, debutNautique, debutCivil, leverSoleil,
    lune: {
      lever: t(A.SearchRiseSet(A.Body.Moon, obs, +1, midi, 1)),
      coucher: t(A.SearchRiseSet(A.Body.Moon, obs, -1, midi, 1)),
      phase: ill.phase_fraction,
      age: (angle / 360) * 29.530588,
      nomPhase: nomPhaseLune(angle),
    },
  };
}

/** Constellation (abréviation IAU) contenant une position J2000. */
export function constellationDe(raDeg: number, decDeg: number): string {
  return A.Constellation(raDeg / 15, decDeg).symbol;
}

/** Coordonnées de la date (précession + nutation) à partir de J2000. */
export function versDate(raDeg: number, decDeg: number, date: Date): { ra: number; dec: number } {
  const rot = A.Rotation_EQJ_EQD(date);
  const v = A.RotateVector(rot, new A.Vector(...vecRaDec(raDeg, decDeg), A.MakeTime(date)));
  const s = A.SphereFromVector(v);
  return { ra: (s.lon + 360) % 360, dec: s.lat };
}
