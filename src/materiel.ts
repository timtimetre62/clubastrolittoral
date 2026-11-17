// Matériel de l'utilisateur : instruments, oculaires, caméras, et calculs optiques.

export interface Instrument {
  id: string;
  nom: string;
  type: 'telescope' | 'objectif';
  diametre: number; // mm
  focale: number; // mm
}
export interface Oculaire { id: string; nom: string; focale: number; champApparent: number }
export interface Camera { id: string; nom: string; largeur: number; hauteur: number; pixel: number } // mm, mm, µm

export interface Config {
  instrument: string | null;
  accessoire: string | null; // id oculaire ou caméra
  correcteur: number; // 1 = aucun, 2 = Barlow 2x, 0.8 = réducteur…
  rotation: number; // degrés, cadre du capteur
  afficherCadre: boolean;
}

export interface Materiel {
  instruments: Instrument[];
  oculaires: Oculaire[];
  cameras: Camera[];
  config: Config;
}

let n = 0;
export const nouvelId = (p: string) => `${p}-${Date.now().toString(36)}-${(n++).toString(36)}`;

export const MATERIEL_DEFAUT: Materiel = {
  instruments: [
    { id: 'i-80', nom: 'Lunette 80/600', type: 'telescope', diametre: 80, focale: 600 },
    { id: 'i-200', nom: 'Newton 200/1000', type: 'telescope', diametre: 200, focale: 1000 },
    { id: 'i-sc8', nom: 'Schmidt-Cassegrain 203/2032', type: 'telescope', diametre: 203, focale: 2032 },
    { id: 'o-50', nom: 'Objectif 50 mm f/1,8', type: 'objectif', diametre: 27.8, focale: 50 },
    { id: 'o-135', nom: 'Objectif 135 mm f/2', type: 'objectif', diametre: 67.5, focale: 135 },
    { id: 'o-200', nom: 'Objectif 200 mm f/4', type: 'objectif', diametre: 50, focale: 200 },
  ],
  oculaires: [
    { id: 'oc-32', nom: 'Plössl 32 mm', focale: 32, champApparent: 52 },
    { id: 'oc-25', nom: 'Plössl 25 mm', focale: 25, champApparent: 52 },
    { id: 'oc-10', nom: 'Plössl 10 mm', focale: 10, champApparent: 52 },
    { id: 'oc-6', nom: 'Grand champ 6 mm', focale: 6, champApparent: 68 },
  ],
  cameras: [
    { id: 'c-apsc', nom: 'Reflex APS-C (Canon)', largeur: 22.3, hauteur: 14.9, pixel: 4.3 },
    { id: 'c-ff', nom: 'Hybride plein format 24×36', largeur: 36, hauteur: 24, pixel: 5.9 },
    { id: 'c-2600', nom: 'ZWO ASI2600MC', largeur: 23.5, hauteur: 15.7, pixel: 3.76 },
    { id: 'c-533', nom: 'ZWO ASI533MC', largeur: 11.31, hauteur: 11.31, pixel: 3.76 },
    { id: 'c-294', nom: 'ZWO ASI294MC', largeur: 19.1, hauteur: 13, pixel: 4.63 },
    { id: 'c-585', nom: 'ZWO ASI585MC', largeur: 11.2, hauteur: 6.3, pixel: 2.9 },
  ],
  config: { instrument: 'i-200', accessoire: 'oc-25', correcteur: 1, rotation: 0, afficherCadre: true },
};

export const CORRECTEURS: [number, string][] = [
  [1, 'Aucun'], [0.5, 'Réducteur 0,5×'], [0.63, 'Réducteur 0,63×'], [0.8, 'Réducteur/correcteur 0,8×'],
  [1.5, 'Barlow 1,5×'], [2, 'Barlow 2×'], [2.5, 'Barlow 2,5×'], [3, 'Barlow 3×'],
];

export interface Champ {
  type: 'visuel' | 'photo';
  largeur: number; // degrés
  hauteur: number; // degrés (= largeur pour un oculaire)
  grossissement?: number;
  pupille?: number;
  grossissementMax?: number;
  echantillonnage?: number; // secondes d'arc par pixel
  rapport: number; // F/D effectif
  focaleEff: number;
  magLimite: number; // magnitude stellaire limite (visuel)
}

/** Magnitude stellaire limite d'un instrument (ciel correct, œil exercé). */
export const magLimiteInstrument = (d: number) => 2.7 + 5 * Math.log10(d);

export function calculerChamp(m: Materiel): Champ | null {
  const ins = m.instruments.find((i) => i.id === m.config.instrument);
  if (!ins) return null;
  const F = ins.focale * m.config.correcteur;
  const rapport = F / ins.diametre;
  const ocu = m.oculaires.find((o) => o.id === m.config.accessoire);
  if (ocu) {
    const G = F / ocu.focale;
    const champ = ocu.champApparent / G;
    return {
      type: 'visuel', largeur: champ, hauteur: champ, grossissement: G, pupille: ins.diametre / G,
      grossissementMax: 2 * ins.diametre, rapport, focaleEff: F, magLimite: magLimiteInstrument(ins.diametre),
    };
  }
  const cam = m.cameras.find((c) => c.id === m.config.accessoire);
  if (cam) {
    const a = (x: number) => (2 * Math.atan(x / (2 * F)) * 180) / Math.PI;
    return {
      type: 'photo', largeur: a(cam.largeur), hauteur: a(cam.hauteur), echantillonnage: (206.265 * cam.pixel) / F,
      rapport, focaleEff: F, magLimite: magLimiteInstrument(ins.diametre),
    };
  }
  return null;
}

export function fmtAngle(deg: number): string {
  if (deg >= 2) return `${deg.toFixed(1)}°`;
  if (deg * 60 >= 2) return `${(deg * 60).toFixed(deg * 60 < 10 ? 1 : 0)}′`;
  return `${(deg * 3600).toFixed(0)}″`;
}
