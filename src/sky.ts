// Projection stéréographique du ciel et dessin sur un canvas.
import { DEG, mul, vecAzAlt, type Mat3, type Vec3, type PositionCorps } from './astro';
import { couleurBV, type DonneesCiel } from './data';

export interface Vue {
  az: number; // direction regardée, degrés
  alt: number;
  fov: number; // champ horizontal, degrés
}

export interface Options {
  constellations: boolean;
  nomsConstellations: boolean;
  nomsEtoiles: boolean;
  grilleAzAlt: boolean;
  grilleEq: boolean;
  sol: boolean;
}

export interface Pointable {
  x: number;
  y: number;
  r: number;
  type: 'etoile' | 'corps' | 'dso';
  index: number; // indice étoile ou indice corps
}

/** Matrice J2000 -> repère écran (droite, haut, avant) pour une vue donnée. */
export function matriceVue(vue: Vue, eqjHor: Mat3): Mat3 {
  const c = vecAzAlt(vue.az, vue.alt);
  const e = vecAzAlt(vue.az + 90, 0);
  const u = vecAzAlt(vue.az, vue.alt + 90);
  const base = [e, u, c];
  return base.map((b) => [0, 1, 2].map((j) => b[0] * eqjHor[0][j] + b[1] * eqjHor[1][j] + b[2] * eqjHor[2][j]));
}

export function echelle(vue: Vue, largeur: number): number {
  return largeur / 2 / (2 * Math.tan((vue.fov * DEG) / 4));
}

export class Projecteur {
  w = 0; h = 0; s = 1;
  m: Mat3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  constructor(public vue: Vue) {}
  maj(vue: Vue, eqjHor: Mat3, w: number, h: number) {
    this.vue = vue; this.w = w; this.h = h;
    this.s = echelle(vue, w);
    this.m = matriceVue(vue, eqjHor);
  }
  /** Projette un vecteur J2000. Renvoie null derrière l'observateur. */
  proj(v: Vec3, derriere = false): [number, number] | null {
    const m = this.m;
    const z = m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2];
    if (z < (derriere ? -0.999999 : -0.2)) return null;
    const k = (2 / (1 + z)) * this.s;
    const x = m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2];
    const y = m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2];
    return [this.w / 2 + x * k, this.h / 2 - y * k];
  }
  /** Inverse : point écran -> (az, alt) dans le repère horizontal. */
  inverse(px: number, py: number): { az: number; alt: number } {
    const X = (px - this.w / 2) / this.s, Y = -(py - this.h / 2) / this.s;
    const r2 = X * X + Y * Y;
    const z = (4 - r2) / (4 + r2), f = (1 + z) / 2;
    const loc: Vec3 = [X * f, Y * f, z]; // (droite, haut, avant)
    const c = vecAzAlt(this.vue.az, this.vue.alt), e = vecAzAlt(this.vue.az + 90, 0), u = vecAzAlt(this.vue.az, this.vue.alt + 90);
    const hv: Vec3 = [0, 1, 2].map((i) => e[i] * loc[0] + u[i] * loc[1] + c[i] * loc[2]) as Vec3;
    const alt = Math.asin(Math.max(-1, Math.min(1, hv[2]))) / DEG;
    let az = Math.atan2(-hv[1], hv[0]) / DEG;
    if (az < 0) az += 360;
    return { az, alt };
  }
}

export interface Palette {
  fond: string;
  fondHaut: string;
  sol: string;
  horizon: string;
  lignes: string;
  grille: string;
  grilleEq: string;
  texte: string;
  texteDoux: string;
}

export const PALETTE: Palette = {
  fond: '#050914',
  fondHaut: '#0b1530',
  sol: 'rgba(16, 24, 18, 0.93)',
  horizon: '#4f7a5a',
  lignes: 'rgba(110, 150, 220, 0.55)',
  grille: 'rgba(120, 160, 120, 0.25)',
  grilleEq: 'rgba(120, 140, 220, 0.22)',
  texte: '#dfe7ff',
  texteDoux: 'rgba(170, 190, 235, 0.75)',
};

/** Magnitude limite affichée selon le champ (plus on zoome, plus on voit faible). */
export function magLimite(fov: number): number {
  if (fov >= 120) return 5.5;
  if (fov >= 60) return 6.2;
  if (fov >= 25) return 7;
  return 8;
}

function rayonEtoile(mag: number, lim: number): number {
  return Math.max(0.5, 0.6 + (lim - mag) * 0.62);
}

export interface Scene {
  donnees: DonneesCiel;
  corps: PositionCorps[];
  eqjHor: Mat3;
  options: Options;
  selection: Pointable | null;
  selectionV: Vec3 | null;
  /** Calque dessiné sous les étoiles (ciel profond). */
  calqueFond?: (ctx: CanvasRenderingContext2D, p: Projecteur, hauteur: (v: Vec3) => number, pts: Pointable[]) => void;
  /** Calque dessiné par-dessus tout (cadre du champ). */
  calqueDessus?: (ctx: CanvasRenderingContext2D, p: Projecteur) => void;
}

export function dessiner(ctx: CanvasRenderingContext2D, p: Projecteur, sc: Scene, P = PALETTE): Pointable[] {
  const { w, h } = p;
  const pointables: Pointable[] = [];
  const zenith = mulT(sc.eqjHor, [0, 0, 1]);
  const hauteur = (v: Vec3) => v[0] * zenith[0] + v[1] * zenith[1] + v[2] * zenith[2];

  // Fond : dégradé léger vers le zénith
  const g = ctx.createLinearGradient(0, h, 0, 0);
  g.addColorStop(0, P.fondHaut);
  g.addColorStop(1, P.fond);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Grilles
  if (sc.options.grilleAzAlt) grilleAzAlt(ctx, p, sc.eqjHor, P);
  if (sc.options.grilleEq) grilleEq(ctx, p, P);

  // Lignes de constellations
  const fov = p.vue.fov;
  if (sc.options.constellations) {
    ctx.strokeStyle = P.lignes;
    ctx.lineWidth = fov < 30 ? 1.2 : 0.9;
    ctx.beginPath();
    for (const c of sc.donnees.constellations) {
      for (const l of c.linesV) {
        let prev: [number, number] | null = null;
        for (const v of l) {
          const q = sc.options.sol && hauteur(v) < -0.02 ? null : p.proj(v);
          if (q && prev && Math.abs(q[0] - prev[0]) < w * 1.5) {
            ctx.moveTo(prev[0], prev[1]);
            ctx.lineTo(q[0], q[1]);
          }
          prev = q;
        }
      }
    }
    ctx.stroke();
  }

  sc.calqueFond?.(ctx, p, hauteur, pointables);

  // Étoiles (triées par magnitude croissante)
  const E = sc.donnees.etoiles;
  const lim = magLimite(fov);
  const m = p.m, s = p.s, cx = w / 2, cy = h / 2;
  for (let i = 0; i < E.n; i++) {
    const mag = E.mag[i];
    if (mag > lim) break;
    const x0 = E.vec[i * 3], y0 = E.vec[i * 3 + 1], z0 = E.vec[i * 3 + 2];
    const z = m[2][0] * x0 + m[2][1] * y0 + m[2][2] * z0;
    if (z < -0.1) continue;
    if (sc.options.sol && x0 * zenith[0] + y0 * zenith[1] + z0 * zenith[2] < -0.003) continue;
    const k = (2 / (1 + z)) * s;
    const x = cx + (m[0][0] * x0 + m[0][1] * y0 + m[0][2] * z0) * k;
    const y = cy - (m[1][0] * x0 + m[1][1] * y0 + m[1][2] * z0) * k;
    if (x < -10 || y < -10 || x > w + 10 || y > h + 10) continue;
    const r = rayonEtoile(mag, lim);
    ctx.fillStyle = couleurBV(E.bv[i]);
    ctx.globalAlpha = r < 1 ? 0.45 + r * 0.5 : 1;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    ctx.fill();
    pointables.push({ x, y, r, type: 'etoile', index: i });
  }
  ctx.globalAlpha = 1;

  // Noms des étoiles brillantes
  if (sc.options.nomsEtoiles) {
    const magNoms = fov > 100 ? 1.6 : fov > 50 ? 2.3 : fov > 20 ? 3.5 : 5;
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = P.texteDoux;
    ctx.textBaseline = 'middle';
    for (const pt of pointables) {
      if (pt.type !== 'etoile') continue;
      if (E.mag[pt.index] > magNoms) break;
      const n = sc.donnees.noms[E.hip[pt.index]];
      if (n?.[0]) ctx.fillText(n[0], pt.x + pt.r + 4, pt.y);
    }
  }

  // Noms des constellations
  if (sc.options.nomsConstellations) {
    ctx.font = `${fov < 40 ? 14 : 12}px system-ui, sans-serif`;
    ctx.fillStyle = P.lignes;
    ctx.textAlign = 'center';
    for (const c of sc.donnees.constellations) {
      if (sc.options.sol && hauteur(c.posV) < 0) continue;
      const q = p.proj(c.posV);
      if (q) ctx.fillText(c.fr.toUpperCase(), q[0], q[1]);
    }
    ctx.textAlign = 'start';
  }

  // Système solaire
  sc.corps.forEach((c, i) => {
    if (sc.options.sol && hauteur(c.v) < -0.005) return;
    const q = p.proj(c.v);
    if (!q) return;
    const rDisque = (c.diametre / 3600) * DEG * s; // rayon apparent en pixels (approx. au centre)
    const r = Math.max(c.corps.nom === 'Lune' || c.corps.nom === 'Soleil' ? 6 : 2.5, rDisque, rayonEtoile(c.mag, lim) * 0.9);
    if (c.corps.nom === 'Lune') dessinerLune(ctx, q[0], q[1], r, c, p, sc.eqjHor);
    else {
      ctx.fillStyle = c.corps.couleur;
      ctx.beginPath();
      ctx.arc(q[0], q[1], r, 0, 2 * Math.PI);
      ctx.fill();
    }
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillStyle = c.corps.couleur;
    ctx.textBaseline = 'middle';
    ctx.fillText(c.corps.nom, q[0] + r + 5, q[1]);
    pointables.push({ x: q[0], y: q[1], r, type: 'corps', index: i });
  });

  // Sol et horizon
  if (sc.options.sol) dessinerSol(ctx, p, sc.eqjHor, P);

  sc.calqueDessus?.(ctx, p);

  // Sélection
  if (sc.selectionV) {
    const q = p.proj(sc.selectionV);
    if (q) {
      ctx.strokeStyle = '#ffd166';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(q[0], q[1], 12, 0, 2 * Math.PI);
      ctx.stroke();
    }
  }
  return pointables;
}

/** v_J2000 = Mᵀ v_hor */
function mulT(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0][0] * v[0] + m[1][0] * v[1] + m[2][0] * v[2],
    m[0][1] * v[0] + m[1][1] * v[1] + m[2][1] * v[2],
    m[0][2] * v[0] + m[1][2] * v[1] + m[2][2] * v[2],
  ];
}

function horVersJ2000(eqjHor: Mat3, az: number, alt: number): Vec3 {
  return mulT(eqjHor, vecAzAlt(az, alt));
}

function dessinerSol(ctx: CanvasRenderingContext2D, p: Projecteur, eqjHor: Mat3, P: Palette) {
  const pts: [number, number][] = [];
  for (let az = 0; az <= 360; az += 0.5) {
    const q = p.proj(horVersJ2000(eqjHor, az, 0), true);
    if (q) pts.push(q);
  }
  // Le sol est l'extérieur du cercle d'horizon projeté (la vue regarde au-dessus de l'horizon).
  ctx.save();
  ctx.beginPath();
  ctx.rect(-10, -10, p.w + 20, p.h + 20);
  if (pts.length > 2) {
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (const q of pts) ctx.lineTo(q[0], q[1]);
    ctx.closePath();
  }
  ctx.fillStyle = P.sol;
  ctx.fill('evenodd');
  ctx.strokeStyle = P.horizon;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])));
  ctx.stroke();
  ctx.restore();

  // Points cardinaux
  const card = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  ctx.font = '700 15px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  card.forEach((t, i) => {
    const q = p.proj(horVersJ2000(eqjHor, i * 45, 0));
    if (!q || q[0] < 0 || q[0] > p.w || q[1] < 0 || q[1] > p.h) return;
    ctx.fillStyle = i % 2 ? 'rgba(200,220,190,0.7)' : '#e8f0d8';
    ctx.fillText(t, q[0], q[1] + 6);
  });
  ctx.textAlign = 'start';
}

function polyligne(ctx: CanvasRenderingContext2D, p: Projecteur, vs: Vec3[]) {
  let prev: [number, number] | null = null;
  for (const v of vs) {
    const q = p.proj(v);
    if (q && prev && Math.hypot(q[0] - prev[0], q[1] - prev[1]) < p.w) {
      ctx.moveTo(prev[0], prev[1]);
      ctx.lineTo(q[0], q[1]);
    }
    prev = q;
  }
}

function grilleAzAlt(ctx: CanvasRenderingContext2D, p: Projecteur, eqjHor: Mat3, P: Palette) {
  ctx.strokeStyle = P.grille;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  for (let alt = 10; alt < 90; alt += 10) {
    const vs: Vec3[] = [];
    for (let az = 0; az <= 360; az += 2) vs.push(horVersJ2000(eqjHor, az, alt));
    polyligne(ctx, p, vs);
  }
  for (let az = 0; az < 360; az += 15) {
    const vs: Vec3[] = [];
    for (let alt = 0; alt <= 90; alt += 2) vs.push(horVersJ2000(eqjHor, az, alt));
    polyligne(ctx, p, vs);
  }
  ctx.stroke();
}

function grilleEq(ctx: CanvasRenderingContext2D, p: Projecteur, P: Palette) {
  const v = (ra: number, dec: number): Vec3 => {
    const a = ra * DEG, d = dec * DEG;
    return [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)];
  };
  ctx.strokeStyle = P.grilleEq;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  for (let dec = -80; dec <= 80; dec += 10) {
    const vs: Vec3[] = [];
    for (let ra = 0; ra <= 360; ra += 2) vs.push(v(ra, dec));
    polyligne(ctx, p, vs);
  }
  for (let ra = 0; ra < 360; ra += 15) {
    const vs: Vec3[] = [];
    for (let dec = -90; dec <= 90; dec += 2) vs.push(v(ra, dec));
    polyligne(ctx, p, vs);
  }
  ctx.stroke();
}

/** La Lune avec sa phase, le limbe éclairé tourné vers le Soleil. */
function dessinerLune(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, c: PositionCorps, p: Projecteur, eqjHor: Mat3) {
  // Direction du nord céleste à l'écran au niveau de la Lune
  const ra = c.ra * DEG, dec = c.dec * DEG;
  const nord: Vec3 = [-Math.sin(dec) * Math.cos(ra), -Math.sin(dec) * Math.sin(ra), Math.cos(dec)];
  const q0 = p.proj(c.v);
  const eps = 0.001;
  const q1 = p.proj([c.v[0] + nord[0] * eps, c.v[1] + nord[1] * eps, c.v[2] + nord[2] * eps]);
  void eqjHor;
  let angleNord = -Math.PI / 2;
  if (q0 && q1) angleNord = Math.atan2(q1[1] - q0[1], q1[0] - q0[0]);
  // Angle de position compté du nord vers l'est. À l'écran, l'est est à gauche du nord
  // quand on regarde le ciel (image non inversée) : on tourne dans le sens antihoraire.
  const est = p.proj([c.v[0] + eps * -Math.sin(ra), c.v[1] + eps * Math.cos(ra), c.v[2]]);
  let sens = -1;
  if (q0 && q1 && est) {
    const cross = (q1[0] - q0[0]) * (est[1] - q0[1]) - (q1[1] - q0[1]) * (est[0] - q0[0]);
    sens = cross < 0 ? -1 : 1;
  }
  const angle = angleNord + sens * (c.angleLimbe ?? 0) * DEG;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = '#2a2d33';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, 2 * Math.PI);
  ctx.fill();
  // Partie éclairée : demi-disque côté +x et ellipse de terminateur
  const k = 2 * c.phase - 1; // -1 nouvelle, +1 pleine
  ctx.fillStyle = '#f2f2e6';
  ctx.beginPath();
  ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);
  ctx.ellipse(0, 0, Math.abs(k) * r, r, 0, Math.PI / 2, -Math.PI / 2, k < 0);
  ctx.fill();
  ctx.restore();
}

export { mul };
