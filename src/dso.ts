// Objets du ciel profond : chargement, filtres et dessin.
import { DEG, vecRaDec, type Vec3 } from './astro';
import type { Projecteur, Pointable } from './sky';
import type { Champ } from './materiel';

export type Famille = 'gal' | 'gc' | 'oc' | 'cn' | 'neb' | 'pn' | 'dn' | 'snr' | 'autre';

export interface Dso {
  ra: number; dec: number; v: Vec3;
  mag: number; // 99 = inconnue
  famille: Famille; type: string;
  maj: number; min: number; pa: number; // minutes d'arc, degrés
  ids: [string, string][]; // [catalogue, désignation]
  cats: Set<string>;
  nom: string; morpho: string;
}

export const CATALOGUES: [string, string][] = [
  ['M', 'Messier'], ['C', 'Caldwell'], ['NGC', 'NGC'], ['IC', 'IC'], ['Sh2', 'Sharpless'],
  ['B', 'Barnard'], ['LDN', 'Lynds sombres (LDN)'], ['LBN', 'Lynds brillantes (LBN)'], ['VdB', 'van den Bergh'],
  ['Cr', 'Collinder'], ['Mel', 'Melotte'], ['Tr', 'Trumpler'], ['St', 'Stock'], ['Ru', 'Ruprecht'],
  ['RCW', 'RCW'], ['Ced', 'Cederblad'], ['Arp', 'Arp'], ['PK', 'Nébuleuses planétaires (PK)'],
];

export const NOMS_FAMILLES: Record<Famille, string> = {
  gal: 'Galaxie', gc: 'Amas globulaire', oc: 'Amas ouvert', cn: 'Amas et nébuleuse', neb: 'Nébuleuse en émission / réflexion',
  pn: 'Nébuleuse planétaire', dn: 'Nébuleuse obscure', snr: 'Rémanent de supernova', autre: 'Autre objet',
};

export const COULEURS: Record<Famille, string> = {
  gal: '#ff9c8a', gc: '#ffd36b', oc: '#ffe08a', cn: '#9be7a6', neb: '#7fdc9f', pn: '#7fe3d9',
  dn: '#a8a29a', snr: '#e6a3ff', autre: '#c8c8c8',
};

export async function chargerDso(): Promise<Dso[]> {
  const raw = (await fetch(new URL('data/dso.json', document.baseURI).href).then((r) => r.json())) as
    [number, number, number, Famille, string, number, number, number, string, string, string][];
  return raw.map(([ra, dec, mag, famille, type, maj, min, pa, ids, nom, morpho]) => {
    const liste = ids.split('|').map((x) => x.split(':') as [string, string]);
    return { ra, dec, v: vecRaDec(ra, dec), mag, famille, type, maj, min, pa, ids: liste, cats: new Set(liste.map((x) => x[0])), nom, morpho };
  });
}

/** Désignation principale (Messier d'abord, puis Caldwell, NGC…). */
export const designation = (o: Dso) => o.ids[0][1];
export const titreDso = (o: Dso) => (o.nom ? `${designation(o)} · ${o.nom}` : designation(o));

export type Mode = 'tout' | 'visuel' | 'photo';

export interface FiltreDso {
  catalogues: Record<string, boolean>;
  mode: Mode;
}

export const FILTRE_DEFAUT: FiltreDso = {
  catalogues: Object.fromEntries(CATALOGUES.map(([c]) => [c, ['M', 'C', 'NGC', 'IC', 'Sh2', 'B'].includes(c)])),
  mode: 'tout',
};

/** L'objet passe-t-il les filtres de catalogue et de mode (indépendamment du zoom) ? */
export function accepte(o: Dso, f: FiltreDso, champ: Champ | null): boolean {
  let ok = false;
  for (const c of o.cats) if (f.catalogues[c]) { ok = true; break; }
  if (!ok) return false;
  if (f.mode === 'visuel') {
    if (o.famille === 'dn') return o.cats.has('B') && o.maj >= 3; // seules les Barnard bien contrastées
    if (o.cats.has('LBN') && o.mag >= 99 && !o.cats.has('NGC') && !o.cats.has('IC') && !o.cats.has('M')) return false;
    const lim = (champ?.magLimite ?? 12.5) - 1.5;
    if (o.mag < 99 && o.mag > lim) return false;
    if (o.mag >= 99 && o.famille === 'gal') return false;
  } else if (f.mode === 'photo') {
    const larg = champ?.type === 'photo' ? champ.largeur * 60 : 300; // minutes d'arc
    if (o.maj > 0 && o.maj < larg / 40) return false; // trop petit pour ce champ
    if (o.maj === 0 && o.famille !== 'gc') return false;
  }
  return true;
}

/** Filtre de densité selon le zoom, pour garder une carte lisible. */
export function visibleAuZoom(o: Dso, fov: number): boolean {
  if (o.cats.has('M') || o.cats.has('C')) return true;
  const [m, t] = fov > 90 ? [6, 120] : fov > 40 ? [9, 45] : fov > 15 ? [11, 12] : fov > 5 ? [13.5, 3] : [99, 0];
  return (o.mag < 99 && o.mag <= m) || o.maj >= t;
}

/** Angle à l'écran de la direction du nord céleste au point v. */
function angleNord(p: Projecteur, o: Dso, q: [number, number]): number {
  const ra = o.ra * DEG, dec = o.dec * DEG, e = 0.0005;
  const nord: Vec3 = [-Math.sin(dec) * Math.cos(ra), -Math.sin(dec) * Math.sin(ra), Math.cos(dec)];
  const q1 = p.proj([o.v[0] + nord[0] * e, o.v[1] + nord[1] * e, o.v[2] + nord[2] * e]);
  return q1 ? Math.atan2(q1[1] - q[1], q1[0] - q[0]) : -Math.PI / 2;
}

export function dessinerDso(
  ctx: CanvasRenderingContext2D, p: Projecteur, objets: Dso[], filtre: FiltreDso, champ: Champ | null,
  hauteur: (v: Vec3) => number, sol: boolean, pointables: Pointable[],
) {
  const fov = p.vue.fov, w = p.w, h = p.h;
  const etiquettes: [number, number, string, string][] = [];
  const maxLabels = fov > 60 ? 60 : 160;
  ctx.lineWidth = 1.1;
  for (let i = 0; i < objets.length; i++) {
    const o = objets[i];
    if (!visibleAuZoom(o, fov) || !accepte(o, filtre, champ)) continue;
    if (sol && hauteur(o.v) < 0) continue;
    const q = p.proj(o.v);
    if (!q || q[0] < -200 || q[1] < -200 || q[0] > w + 200 || q[1] > h + 200) continue;
    const rMaj = Math.max(4.5, (o.maj / 2 / 60) * DEG * p.s);
    const rMin = o.min > 0 ? Math.max(o.famille === 'gal' ? 2 : 4.5, (o.min / 2 / 60) * DEG * p.s) : rMaj;
    if (rMaj > Math.max(w, h) * 3) continue;
    const coul = COULEURS[o.famille];
    ctx.strokeStyle = coul;
    ctx.fillStyle = coul;
    ctx.globalAlpha = o.cats.has('M') || o.cats.has('C') ? 0.95 : 0.7;
    ctx.setLineDash([]);
    ctx.save();
    ctx.translate(q[0], q[1]);
    const tourne = () => ctx.rotate(angleNord(p, o, q) + Math.PI / 2 - (o.pa * DEG));
    ctx.beginPath();
    switch (o.famille) {
      case 'gal':
        tourne();
        ctx.ellipse(0, 0, rMin, rMaj, 0, 0, 2 * Math.PI);
        ctx.stroke();
        break;
      case 'gc':
        ctx.arc(0, 0, rMaj, 0, 2 * Math.PI);
        ctx.moveTo(-rMaj, 0); ctx.lineTo(rMaj, 0); ctx.moveTo(0, -rMaj); ctx.lineTo(0, rMaj);
        ctx.stroke();
        break;
      case 'oc':
        ctx.setLineDash([3, 3]);
        ctx.arc(0, 0, rMaj, 0, 2 * Math.PI);
        ctx.stroke();
        break;
      case 'cn':
        ctx.setLineDash([3, 3]);
        ctx.arc(0, 0, rMaj, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeRect(-rMaj * 0.6, -rMaj * 0.6, rMaj * 1.2, rMaj * 1.2);
        break;
      case 'pn':
        ctx.arc(0, 0, rMaj * 0.6, 0, 2 * Math.PI);
        for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.moveTo(a * rMaj * 0.6, b * rMaj * 0.6); ctx.lineTo(a * rMaj, b * rMaj); }
        ctx.stroke();
        break;
      case 'dn':
        ctx.setLineDash([2, 3]);
        tourne();
        ctx.ellipse(0, 0, rMin, rMaj, 0, 0, 2 * Math.PI);
        ctx.stroke();
        break;
      case 'snr':
        ctx.setLineDash([1, 3]);
        ctx.arc(0, 0, rMaj, 0, 2 * Math.PI);
        ctx.stroke();
        break;
      default:
        if (rMaj > 8) { tourne(); ctx.ellipse(0, 0, rMin, rMaj, 0, 0, 2 * Math.PI); ctx.stroke(); }
        else ctx.strokeRect(-rMaj, -rMaj, rMaj * 2, rMaj * 2);
    }
    ctx.restore();
    pointables.push({ x: q[0], y: q[1], r: Math.min(rMaj, 14), type: 'dso', index: i });
    if (etiquettes.length < maxLabels) {
      const lbl = designation(o) + (o.nom && (fov < 30 || o.cats.has('M')) ? ` ${o.nom}` : '');
      etiquettes.push([q[0] + Math.min(rMaj, 40) * 0.75 + 3, q[1] - Math.min(rMaj, 40) * 0.75, lbl, coul]);
    }
  }
  ctx.setLineDash([]);
  ctx.globalAlpha = 0.85;
  ctx.font = '11px system-ui, sans-serif';
  ctx.textBaseline = 'bottom';
  for (const [x, y, t, c] of etiquettes) { ctx.fillStyle = c; ctx.fillText(t, x, y); }
  ctx.globalAlpha = 1;
}

/** Cadre du champ de l'oculaire ou du capteur, au centre de l'écran. */
export function dessinerCadre(ctx: CanvasRenderingContext2D, p: Projecteur, champ: Champ, rotation: number) {
  const s = p.s;
  const px = (deg: number) => 2 * Math.tan((deg * DEG) / 4) * s * 2; // diamètre projeté (stéréographique)
  const cx = p.w / 2, cy = p.h / 2;
  ctx.save();
  ctx.strokeStyle = '#ff6b6b';
  ctx.lineWidth = 1.5;
  ctx.translate(cx, cy);
  if (champ.type === 'visuel') {
    ctx.beginPath();
    ctx.arc(0, 0, px(champ.largeur) / 2, 0, 2 * Math.PI);
    ctx.stroke();
  } else {
    ctx.rotate(rotation * DEG);
    const lw = px(champ.largeur), lh = px(champ.hauteur);
    ctx.strokeRect(-lw / 2, -lh / 2, lw, lh);
    ctx.beginPath(); // repère du haut du capteur
    ctx.moveTo(-6, -lh / 2); ctx.lineTo(0, -lh / 2 - 7); ctx.lineTo(6, -lh / 2);
    ctx.stroke();
  }
  ctx.restore();
}
