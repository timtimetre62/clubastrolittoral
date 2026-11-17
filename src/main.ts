import './style.css';
import {
  matriceEqjHor, positionsCorps, evenements, evenementsFixe, nuit, constellationDe, versDate,
  mul, azAltDeVec, avecRefraction, vecRaDec, type Lieu, type Vec3, type PositionCorps, type Evenements,
} from './astro';
import { chargerDonnees, nomEtoile, type DonneesCiel } from './data';
import { Projecteur, dessiner, type Vue, type Options, type Pointable } from './sky';
import {
  chargerDso, dessinerDso, dessinerCadre, accepte, titreDso, designation, CATALOGUES, NOMS_FAMILLES, FILTRE_DEFAUT,
  type Dso, type FiltreDso, type Mode,
} from './dso';
import { MATERIEL_DEFAUT, CORRECTEURS, calculerChamp, fmtAngle, nouvelId, type Materiel, type Champ } from './materiel';

// ---------------------------------------------------------------- État et préférences

const LIEU_DEFAUT: Lieu = { lat: 48.8566, lon: 2.3522, alt: 35, nom: 'Paris (par défaut)' };

function lire<T>(cle: string, defaut: T): T {
  try {
    const s = localStorage.getItem(cle);
    return s ? { ...defaut, ...JSON.parse(s) } : defaut;
  } catch { return defaut; }
}
function ecrire(cle: string, v: unknown) {
  try { localStorage.setItem(cle, JSON.stringify(v)); } catch { /* stockage indisponible */ }
}

const etat = {
  lieu: lire<Lieu>('lieu', LIEU_DEFAUT),
  vue: { az: 180, alt: 35, fov: 100 } as Vue,
  options: lire<Options>('options', {
    constellations: true, nomsConstellations: true, nomsEtoiles: true, grilleAzAlt: false, grilleEq: false, sol: true,
  }),
  nuitRouge: lire<{ on: boolean }>('nuitRouge', { on: false }).on,
  direct: true,
  date: new Date(),
  selection: null as null | { type: 'etoile' | 'corps' | 'dso'; index: number; v: Vec3 },
  materiel: lire<Materiel>('materiel', MATERIEL_DEFAUT),
  filtre: lire<FiltreDso>('filtreDso', FILTRE_DEFAUT),
};
etat.filtre.catalogues = { ...FILTRE_DEFAUT.catalogues, ...etat.filtre.catalogues };
etat.materiel.config = { ...MATERIEL_DEFAUT.config, ...etat.materiel.config };
let champ: Champ | null = calculerChamp(etat.materiel);
let objets: Dso[] = [];

let donnees: DonneesCiel;
let genitifs = new Map<string, string>();
let corps: PositionCorps[] = [];
let pointables: Pointable[] = [];

const $ = <T extends HTMLElement>(s: string) => document.querySelector(s) as T;
const canvas = $<HTMLCanvasElement>('#ciel');
const ctx = canvas.getContext('2d')!;
const proj = new Projecteur(etat.vue);

// ---------------------------------------------------------------- Formatage

const fmtHeure = (d: Date | null) => (d ? d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—');
const fmtDate = (d: Date) => d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const fmtDeg = (x: number, d = 1) => `${x.toFixed(d)}°`;
function fmtHMS(raDeg: number) {
  const h = raDeg / 15, H = Math.floor(h), m = (h - H) * 60, M = Math.floor(m), S = (m - M) * 60;
  return `${H}h ${String(M).padStart(2, '0')}m ${S.toFixed(1).padStart(4, '0')}s`;
}
function fmtDMS(dec: number) {
  const s = dec < 0 ? '−' : '+', a = Math.abs(dec), D = Math.floor(a), m = (a - D) * 60, M = Math.floor(m), S = (m - M) * 60;
  return `${s}${D}° ${String(M).padStart(2, '0')}′ ${S.toFixed(0).padStart(2, '0')}″`;
}
const PTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
const pointCardinal = (az: number) => PTS[Math.round(az / 22.5) % 16];

// ---------------------------------------------------------------- Rendu

let besoinRendu = true;
function demanderRendu() { besoinRendu = true; }

function calculer() {
  corps = positionsCorps(etat.date, etat.lieu);
  if (etat.selection?.type === 'corps') etat.selection.v = corps[etat.selection.index].v;
}

function boucle() {
  if (besoinRendu && donnees) {
    besoinRendu = false;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const m = matriceEqjHor(etat.date, etat.lieu);
    proj.maj(etat.vue, m, w, h);
    pointables = dessiner(ctx, proj, {
      donnees, corps, eqjHor: m, options: etat.options, selection: null, selectionV: etat.selection?.v ?? null,
      calqueFond: (c, p, hauteur, pts) => dessinerDso(c, p, objets, etat.filtre, champ, hauteur, etat.options.sol, pts),
      calqueDessus: (c, p) => {
        if (champ && etat.materiel.config.afficherCadre) dessinerCadre(c, p, champ, etat.materiel.config.rotation);
      },
    });
    majBarre();
  }
  requestAnimationFrame(boucle);
}

function majBarre() {
  $('#heure').textContent = `${fmtDate(etat.date)} · ${fmtHeure(etat.date)}`;
  $('#direct').classList.toggle('actif', etat.direct);
  $('#lieu-nom').textContent = etat.lieu.nom || `${etat.lieu.lat.toFixed(2)}°, ${etat.lieu.lon.toFixed(2)}°`;
  $('#champ').textContent = `champ ${etat.vue.fov.toFixed(etat.vue.fov < 10 ? 1 : 0)}° · regard ${pointCardinal(etat.vue.az)} ${etat.vue.alt.toFixed(0)}°`;
}

function changerDate(d: Date, direct = false) {
  etat.date = d;
  etat.direct = direct;
  calculer();
  demanderRendu();
  if (!$('#panneau-info').hidden) afficherInfo();
}

setInterval(() => { if (etat.direct) changerDate(new Date(), true); }, 5000);

// ---------------------------------------------------------------- Interaction : glisser, zoomer, toucher

const pointeurs = new Map<number, { x: number; y: number }>();
let ecartPincement = 0, deplace = 0;

function limiterVue() {
  etat.vue.fov = Math.max(1, Math.min(180, etat.vue.fov));
  etat.vue.alt = Math.max(etat.options.sol ? 2 : -89, Math.min(89.9, etat.vue.alt));
  etat.vue.az = ((etat.vue.az % 360) + 360) % 360;
}

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointeurs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  deplace = 0;
  if (pointeurs.size === 2) {
    const [a, b] = [...pointeurs.values()];
    ecartPincement = Math.hypot(a.x - b.x, a.y - b.y);
  }
});
canvas.addEventListener('pointermove', (e) => {
  const prec = pointeurs.get(e.pointerId);
  if (!prec) return;
  const cur = { x: e.clientX, y: e.clientY };
  pointeurs.set(e.pointerId, cur);
  if (pointeurs.size === 1) {
    const dx = cur.x - prec.x, dy = cur.y - prec.y;
    deplace += Math.abs(dx) + Math.abs(dy);
    const radParPx = 1 / proj.s;
    etat.vue.az -= (dx * radParPx * 180) / Math.PI / Math.max(0.2, Math.cos((etat.vue.alt * Math.PI) / 180));
    etat.vue.alt += (dy * radParPx * 180) / Math.PI;
  } else if (pointeurs.size === 2) {
    const [a, b] = [...pointeurs.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (ecartPincement > 0) etat.vue.fov *= ecartPincement / d;
    ecartPincement = d;
    deplace += 10;
  }
  limiterVue();
  demanderRendu();
});
const fin = (e: PointerEvent) => {
  const etaitSeul = pointeurs.size === 1;
  pointeurs.delete(e.pointerId);
  if (pointeurs.size < 2) ecartPincement = 0;
  if (etaitSeul && deplace < 8 && e.type === 'pointerup') choisir(e.offsetX, e.offsetY);
};
canvas.addEventListener('pointerup', fin);
canvas.addEventListener('pointercancel', fin);
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  etat.vue.fov *= Math.exp(e.deltaY * 0.0012);
  limiterVue();
  demanderRendu();
}, { passive: false });

function choisir(x: number, y: number) {
  let meilleur: Pointable | null = null, dMin = 22;
  for (const p of pointables) {
    // Favorise les objets brillants : distance réduite par le rayon
    const d = Math.hypot(p.x - x, p.y - y) - p.r * 1.5 - (p.type === 'corps' ? 6 : 0);
    if (d < dMin) { dMin = d; meilleur = p; }
  }
  if (!meilleur) { fermerInfo(); return; }
  const v: Vec3 = meilleur.type === 'corps'
    ? corps[meilleur.index].v
    : meilleur.type === 'dso' ? objets[meilleur.index].v : [donnees.etoiles.vec[meilleur.index * 3], donnees.etoiles.vec[meilleur.index * 3 + 1], donnees.etoiles.vec[meilleur.index * 3 + 2]];
  etat.selection = { type: meilleur.type, index: meilleur.index, v };
  afficherInfo();
  demanderRendu();
}

function centrerSur(v: Vec3, fov?: number) {
  const { az, alt } = azAltDeVec(mul(matriceEqjHor(etat.date, etat.lieu), v));
  etat.vue.az = az;
  etat.vue.alt = alt;
  if (fov) etat.vue.fov = fov;
  limiterVue();
  demanderRendu();
}

// ---------------------------------------------------------------- Fiche d'un objet

function lignesEvenements(ev: Evenements): string {
  if (ev.circumpolaire) return `<tr><th>Visibilité</th><td>Circumpolaire (ne se couche jamais ici)</td></tr>`
    + `<tr><th>Culmination</th><td>${fmtHeure(ev.culmination)} à ${fmtDeg(ev.hauteurCulmination ?? 0, 0)}</td></tr>`;
  if (ev.jamaisLeve) return `<tr><th>Visibilité</th><td>Ne se lève pas depuis ce lieu aujourd'hui</td></tr>`;
  return `<tr><th>Lever</th><td>${fmtHeure(ev.lever)}</td></tr>`
    + `<tr><th>Culmination</th><td>${fmtHeure(ev.culmination)}${ev.hauteurCulmination != null ? ` à ${fmtDeg(ev.hauteurCulmination, 0)}` : ''}</td></tr>`
    + `<tr><th>Coucher</th><td>${fmtHeure(ev.coucher)}</td></tr>`;
}

function afficherInfo() {
  const s = etat.selection;
  if (!s) return;
  const m = matriceEqjHor(etat.date, etat.lieu);
  const { az, alt } = azAltDeVec(mul(m, s.v));
  const debut = new Date(etat.date.getTime() - 12 * 3600e3);
  let titre = '', sousTitre = '', ra: number, dec: number, mag: number, ev: Evenements, extra = '';
  if (s.type === 'corps') {
    const c = corps[s.index];
    titre = c.corps.nom;
    sousTitre = c.corps.nom === 'Soleil' ? 'Étoile' : c.corps.nom === 'Lune' ? 'Satellite naturel' : 'Planète';
    ra = c.ra; dec = c.dec; mag = c.mag;
    ev = evenements(c.corps.id, etat.lieu, debut);
    extra += `<tr><th>Diamètre apparent</th><td>${c.diametre > 120 ? (c.diametre / 60).toFixed(1) + '′' : c.diametre.toFixed(1) + '″'}</td></tr>`;
    if (c.corps.nom !== 'Soleil') extra += `<tr><th>Phase</th><td>${(c.phase * 100).toFixed(0)} % éclairé</td></tr>`;
  } else if (s.type === 'dso') {
    const o = objets[s.index];
    titre = o.nom || designation(o);
    sousTitre = NOMS_FAMILLES[o.famille];
    ra = o.ra; dec = o.dec; mag = o.mag;
    ev = evenementsFixe(ra, dec, etat.lieu, debut);
    extra += `<tr><th>Désignations</th><td>${o.ids.map((x) => x[1]).join(' · ')}</td></tr>`;
    if (o.maj > 0) extra += `<tr><th>Dimensions</th><td>${fmtAngle(o.maj / 60)}${o.min > 0 ? ' × ' + fmtAngle(o.min / 60) : ''}</td></tr>`;
    if (o.morpho) extra += `<tr><th>Morphologie</th><td>${o.morpho}</td></tr>`;
    if (champ && o.maj > 0) {
      const pct = (o.maj / 60 / Math.min(champ.largeur, champ.hauteur)) * 100;
      extra += `<tr><th>Dans votre champ</th><td>${pct > 100 ? 'Plus grand que le champ (mosaïque ou focale plus courte)' : `occupe ${pct.toFixed(0)} % du champ`}</td></tr>`;
    }
    if (champ && o.mag < 99 && champ.type === 'visuel') {
      extra += `<tr><th>Visuel</th><td>${o.mag <= champ.magLimite - 2 ? 'Accessible' : o.mag <= champ.magLimite - 0.5 ? 'Difficile' : 'Hors de portée'} avec cet instrument</td></tr>`;
    }
  } else {
    const E = donnees.etoiles, i = s.index;
    titre = nomEtoile(donnees, E.hip[i], genitifs);
    sousTitre = `Étoile · HIP ${E.hip[i]}`;
    ra = E.ra[i]; dec = E.dec[i]; mag = E.mag[i];
    ev = evenementsFixe(ra, dec, etat.lieu, debut);
    extra += `<tr><th>Indice B−V</th><td>${E.bv[i].toFixed(2)}</td></tr>`;
  }
  const cons = constellationDe(ra, dec);
  const consNom = donnees.constellations.find((c) => c.id === cons)?.fr ?? cons;
  const dd = versDate(ra, dec, etat.date);
  $('#info-titre').textContent = titre;
  $('#info-sous-titre').textContent = `${sousTitre} · ${consNom}`;
  $('#info-table').innerHTML = `
    <tr><th>Magnitude</th><td>${mag >= 99 ? 'non mesurée' : mag.toFixed(s.type === 'dso' ? 1 : 2)}</td></tr>
    <tr><th>Hauteur</th><td>${fmtDeg(avecRefraction(alt))}${alt < 0 ? ' (sous l’horizon)' : ''}</td></tr>
    <tr><th>Azimut</th><td>${fmtDeg(az)} (${pointCardinal(az)})</td></tr>
    <tr><th>AD / Déc. (J2000)</th><td>${fmtHMS(ra)} / ${fmtDMS(dec)}</td></tr>
    <tr><th>AD / Déc. (date)</th><td>${fmtHMS(dd.ra)} / ${fmtDMS(dd.dec)}</td></tr>
    ${lignesEvenements(ev)}
    ${extra}`;
  $('#panneau-info').hidden = false;
}

function fermerInfo() {
  etat.selection = null;
  $('#panneau-info').hidden = true;
  demanderRendu();
}
$('#info-fermer').addEventListener('click', fermerInfo);
$('#info-centrer').addEventListener('click', () => { if (etat.selection) centrerSur(etat.selection.v); });

// ---------------------------------------------------------------- Recherche

interface Resultat { label: string; type: string; cle?: string; v: () => Vec3; select?: () => void; fov?: number }
let index: Resultat[] = [];

function construireIndex() {
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  index = [];
  corps.forEach((c, i) => index.push({
    label: c.corps.nom, type: c.corps.nom === 'Lune' || c.corps.nom === 'Soleil' ? '' : 'planète',
    v: () => corps[i].v, select: () => { etat.selection = { type: 'corps', index: i, v: corps[i].v }; },
  }));
  for (const c of donnees.constellations) {
    index.push({ label: `${c.fr} (${c.la})`, type: 'constellation', v: () => c.posV, fov: 50 });
  }
  const E = donnees.etoiles;
  for (let i = 0; i < E.n; i++) {
    const n = donnees.noms[E.hip[i]];
    if (!n?.[0]) continue;
    const v: Vec3 = [E.vec[i * 3], E.vec[i * 3 + 1], E.vec[i * 3 + 2]];
    index.push({ label: nomEtoile(donnees, E.hip[i], genitifs), type: 'étoile', v: () => v, select: () => { etat.selection = { type: 'etoile', index: i, v }; } });
  }
  objets.forEach((o, i) => index.push({
    label: titreDso(o), type: NOMS_FAMILLES[o.famille].toLowerCase(), cle: o.ids.map((x) => x[1].replace(/[\s-]+/g, '').toLowerCase()).join('|'),
    v: () => o.v, select: () => { etat.selection = { type: 'dso', index: i, v: o.v }; },
  }));
  const input = $<HTMLInputElement>('#recherche');
  const liste = $<HTMLUListElement>('#resultats');
  input.addEventListener('input', () => {
    const q = norm(input.value.trim());
    liste.innerHTML = '';
    if (q.length < 2) return;
    const q2 = q.replace(/[\s-]+/g, '');
    const exacts: Resultat[] = [], autres: Resultat[] = [];
    for (const x of index) {
      const ids = x.cle?.split('|');
      if (ids?.includes(q2)) exacts.push(x);
      else if (autres.length < 15 && (norm(x.label).includes(q) || ids?.some((id) => id.startsWith(q2)))) autres.push(x);
    }
    const r = [...exacts, ...autres].slice(0, 15);
    for (const x of r) {
      const li = document.createElement('li');
      li.innerHTML = `<span>${x.label}</span><small>${x.type}</small>`;
      li.addEventListener('click', () => {
        x.select?.();
        centrerSur(x.v(), x.fov ?? Math.min(etat.vue.fov, 60));
        if (x.select) afficherInfo();
        liste.innerHTML = '';
        input.value = '';
        input.blur();
      });
      liste.appendChild(li);
    }
  });
}

// ---------------------------------------------------------------- Panneaux

function ouvrir(id: string) {
  document.querySelectorAll<HTMLElement>('.panneau').forEach((p) => { if (p.id !== id) p.hidden = true; });
  const p = $(`#${id}`);
  p.hidden = !p.hidden;
  if (id === 'panneau-soir' && !p.hidden) afficherSoir();
  if (id === 'panneau-lieu' && !p.hidden) remplirLieu();
  if (id === 'panneau-materiel' && !p.hidden) afficherMateriel();
  if (id === 'panneau-objets' && !p.hidden) afficherObjets();
}
document.querySelectorAll<HTMLElement>('[data-ouvre]').forEach((b) => b.addEventListener('click', () => ouvrir(b.dataset.ouvre!)));
document.querySelectorAll<HTMLElement>('[data-ferme]').forEach((b) => b.addEventListener('click', () => { b.closest<HTMLElement>('.panneau')!.hidden = true; }));

// Options d'affichage
document.querySelectorAll<HTMLInputElement>('#panneau-options input[type=checkbox]').forEach((cb) => {
  const k = cb.name as keyof Options;
  cb.checked = etat.options[k];
  cb.addEventListener('change', () => {
    etat.options[k] = cb.checked;
    ecrire('options', etat.options);
    limiterVue();
    demanderRendu();
  });
});

// Mode nuit (rouge)
function appliquerNuit() {
  document.documentElement.classList.toggle('nuit-rouge', etat.nuitRouge);
  $('#bouton-nuit').setAttribute('aria-pressed', String(etat.nuitRouge));
}
$('#bouton-nuit').addEventListener('click', () => { etat.nuitRouge = !etat.nuitRouge; ecrire('nuitRouge', { on: etat.nuitRouge }); appliquerNuit(); });
appliquerNuit();

// Lieu d'observation
function remplirLieu() {
  $<HTMLInputElement>('#lieu-lat').value = String(etat.lieu.lat);
  $<HTMLInputElement>('#lieu-lon').value = String(etat.lieu.lon);
  $<HTMLInputElement>('#lieu-alt').value = String(etat.lieu.alt);
  $<HTMLInputElement>('#lieu-nom-input').value = etat.lieu.nom ?? '';
}
function definirLieu(l: Lieu) {
  etat.lieu = l;
  ecrire('lieu', l);
  calculer();
  demanderRendu();
  if (!$('#panneau-soir').hidden) afficherSoir();
}
$('#lieu-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const lat = parseFloat($<HTMLInputElement>('#lieu-lat').value);
  const lon = parseFloat($<HTMLInputElement>('#lieu-lon').value);
  const alt = parseFloat($<HTMLInputElement>('#lieu-alt').value) || 0;
  if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) { $('#lieu-msg').textContent = 'Coordonnées invalides.'; return; }
  definirLieu({ lat, lon, alt, nom: $<HTMLInputElement>('#lieu-nom-input').value.trim() || undefined });
  $('#lieu-msg').textContent = 'Lieu enregistré.';
});
$('#lieu-gps').addEventListener('click', () => {
  if (!navigator.geolocation) { $('#lieu-msg').textContent = 'La géolocalisation n’est pas disponible.'; return; }
  $('#lieu-msg').textContent = 'Recherche de la position…';
  navigator.geolocation.getCurrentPosition(
    (p) => {
      definirLieu({
        lat: Math.round(p.coords.latitude * 1e4) / 1e4, lon: Math.round(p.coords.longitude * 1e4) / 1e4,
        alt: Math.round(p.coords.altitude ?? 0), nom: 'Ma position',
      });
      remplirLieu();
      $('#lieu-msg').textContent = 'Position trouvée et enregistrée.';
    },
    (err) => { $('#lieu-msg').textContent = `Position introuvable (${err.message}).`; },
    { enableHighAccuracy: true, timeout: 15000 },
  );
});

// Ce soir
function afficherSoir() {
  const n = nuit(etat.date, etat.lieu);
  const debut = n.coucherSoleil ?? etat.date;
  const planetes = corps.filter((c) => !['Soleil', 'Lune'].includes(c.corps.nom)).map((c) => {
    const ev = evenements(c.corps.id, etat.lieu, new Date(debut.getTime() - 6 * 3600e3));
    return `<tr><th>${c.corps.nom}</th><td>${fmtHeure(ev.lever)}</td><td>${fmtHeure(ev.culmination)}${ev.hauteurCulmination != null ? ` <small>${ev.hauteurCulmination.toFixed(0)}°</small>` : ''}</td><td>${fmtHeure(ev.coucher)}</td><td>${c.mag.toFixed(1)}</td></tr>`;
  }).join('');
  $('#soir-contenu').innerHTML = `
    <p class="soir-lieu">${etat.lieu.nom ?? ''} · nuit du ${fmtDate(debut)}</p>
    <h3>Le Soleil</h3>
    <table class="table">
      <tr><th>Coucher</th><td>${fmtHeure(n.coucherSoleil)}</td><th>Lever</th><td>${fmtHeure(n.leverSoleil)}</td></tr>
      <tr><th>Fin crépuscule civil</th><td>${fmtHeure(n.finCivil)}</td><th>Début aube civile</th><td>${fmtHeure(n.debutCivil)}</td></tr>
      <tr><th>Fin crépuscule nautique</th><td>${fmtHeure(n.finNautique)}</td><th>Début aube nautique</th><td>${fmtHeure(n.debutNautique)}</td></tr>
      <tr><th>Nuit noire</th><td>${fmtHeure(n.finAstro)}</td><th>Fin nuit noire</th><td>${fmtHeure(n.debutAstro)}</td></tr>
    </table>
    ${n.finAstro ? '' : '<p class="note">Pas de nuit astronomique complète à cette date et ce lieu.</p>'}
    <h3>La Lune</h3>
    <table class="table">
      <tr><th>Phase</th><td colspan="3">${n.lune.nomPhase} · ${(n.lune.phase * 100).toFixed(0)} % · ${n.lune.age.toFixed(1)} jours</td></tr>
      <tr><th>Lever</th><td>${fmtHeure(n.lune.lever)}</td><th>Coucher</th><td>${fmtHeure(n.lune.coucher)}</td></tr>
    </table>
    <h3>Les planètes</h3>
    <table class="table planetes">
      <tr><th></th><th>Lever</th><th>Culmination</th><th>Coucher</th><th>Mag.</th></tr>
      ${planetes}
    </table>`;
}


// ---------------------------------------------------------------- Matériel

function sauverMateriel() {
  ecrire('materiel', etat.materiel);
  champ = calculerChamp(etat.materiel);
  demanderRendu();
  if (!$('#panneau-info').hidden) afficherInfo();
}

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function afficherMateriel() {
  const M = etat.materiel, C = M.config;
  const opt = (v: string, t: string, sel: boolean) => `<option value="${v}"${sel ? ' selected' : ''}>${esc(t)}</option>`;
  const inst = M.instruments.map((i) => opt(i.id, `${i.nom} (${i.diametre}/${i.focale})`, i.id === C.instrument)).join('');
  const acc = `<optgroup label="Oculaires (visuel)">${M.oculaires.map((o) => opt(o.id, `${o.nom} · ${o.focale} mm · ${o.champApparent}°`, o.id === C.accessoire)).join('')}</optgroup>`
    + `<optgroup label="Caméras (photo)">${M.cameras.map((c) => opt(c.id, `${c.nom} · ${c.largeur}×${c.hauteur} mm`, c.id === C.accessoire)).join('')}</optgroup>`;
  const cor = CORRECTEURS.map(([k, t]) => opt(String(k), t, k === C.correcteur)).join('');
  const ch = champ;
  let res = '<p class="note">Choisissez un instrument et un oculaire ou une caméra.</p>';
  if (ch) {
    res = `<table class="table">
      <tr><th>Champ</th><td>${ch.type === 'visuel' ? fmtAngle(ch.largeur) : `${fmtAngle(ch.largeur)} × ${fmtAngle(ch.hauteur)}`}</td></tr>
      <tr><th>Focale résultante</th><td>${ch.focaleEff.toFixed(0)} mm · F/D ${ch.rapport.toFixed(1)}</td></tr>
      ${ch.type === 'visuel' ? `
        <tr><th>Grossissement</th><td>${ch.grossissement!.toFixed(0)}× <small>(max. utile ${ch.grossissementMax!.toFixed(0)}×)</small></td></tr>
        <tr><th>Pupille de sortie</th><td>${ch.pupille!.toFixed(1)} mm${ch.pupille! > 7 ? ' <small>(trop grande, perte de lumière)</small>' : ''}</td></tr>
        <tr><th>Magnitude limite</th><td>≈ ${ch.magLimite.toFixed(1)} (étoiles)</td></tr>`
      : `<tr><th>Échantillonnage</th><td>${ch.echantillonnage!.toFixed(2)}″ / pixel</td></tr>`}
    </table>`;
  }
  const liste = (titre: string, items: { id: string; nom: string; d: string }[], genre: string) => `
    <h3>${titre}</h3>
    <ul class="liste-mat">${items.map((x) => `<li><span>${esc(x.nom)}<small>${x.d}</small></span><button class="icone petit" data-suppr="${genre}:${x.id}" title="Supprimer">✕</button></li>`).join('')}</ul>`;
  $('#materiel-contenu').innerHTML = `
    <label>Instrument <select id="m-inst">${inst}</select></label>
    <label>Oculaire ou caméra <select id="m-acc">${acc}</select></label>
    <label>Barlow / réducteur <select id="m-cor">${cor}</select></label>
    ${ch?.type === 'photo' ? `<label>Rotation du capteur : <span id="m-rot-val">${C.rotation}°</span><input id="m-rot" type="range" min="-90" max="90" step="1" value="${C.rotation}" /></label>` : ''}
    <label class="case"><input id="m-cadre" type="checkbox" ${C.afficherCadre ? 'checked' : ''}/> Afficher le cadre sur la carte</label>
    ${res}
    <button id="m-zoom" ${ch ? '' : 'disabled'}>Zoomer sur le champ</button>
    ${liste('Mes instruments', M.instruments.map((i) => ({ id: i.id, nom: i.nom, d: `${i.diametre} mm · F ${i.focale} mm · F/D ${(i.focale / i.diametre).toFixed(1)}` })), 'instruments')}
    <details><summary>Ajouter un instrument</summary>
      <form id="f-inst" class="mini">
        <input name="nom" placeholder="Nom (ex. Newton 150/750)" required />
        <select name="type"><option value="telescope">Télescope / lunette</option><option value="objectif">Objectif photo</option></select>
        <input name="diametre" type="number" step="any" min="1" placeholder="Diamètre (mm)" />
        <input name="fd" type="number" step="any" min="0.5" placeholder="ou F/D (objectif)" />
        <input name="focale" type="number" step="any" min="1" placeholder="Focale (mm)" required />
        <button>Ajouter</button>
      </form></details>
    ${liste('Mes oculaires', M.oculaires.map((o) => ({ id: o.id, nom: o.nom, d: `${o.focale} mm · ${o.champApparent}°` })), 'oculaires')}
    <details><summary>Ajouter un oculaire</summary>
      <form id="f-ocu" class="mini">
        <input name="nom" placeholder="Nom (ex. Nagler 13 mm)" required />
        <input name="focale" type="number" step="any" min="1" placeholder="Focale (mm)" required />
        <input name="champApparent" type="number" step="any" min="20" max="120" placeholder="Champ apparent (°)" required />
        <button>Ajouter</button>
      </form></details>
    ${liste('Mes caméras', M.cameras.map((c) => ({ id: c.id, nom: c.nom, d: `${c.largeur}×${c.hauteur} mm · pixels ${c.pixel} µm` })), 'cameras')}
    <details><summary>Ajouter une caméra</summary>
      <form id="f-cam" class="mini">
        <input name="nom" placeholder="Nom (ex. Canon 600D)" required />
        <input name="largeur" type="number" step="any" min="1" placeholder="Largeur capteur (mm)" required />
        <input name="hauteur" type="number" step="any" min="1" placeholder="Hauteur capteur (mm)" required />
        <input name="pixel" type="number" step="any" min="0.5" placeholder="Taille pixel (µm)" required />
        <button>Ajouter</button>
      </form></details>
    <p class="note">Votre matériel est enregistré sur cet appareil.</p>`;

  const ch2 = (sel: string, f: (el: HTMLInputElement) => void) => $<HTMLInputElement>(sel)?.addEventListener('change', (e) => f(e.target as HTMLInputElement));
  ch2('#m-inst', (el) => { C.instrument = el.value; sauverMateriel(); afficherMateriel(); });
  ch2('#m-acc', (el) => { C.accessoire = el.value; sauverMateriel(); afficherMateriel(); });
  ch2('#m-cor', (el) => { C.correcteur = parseFloat(el.value); sauverMateriel(); afficherMateriel(); });
  ch2('#m-cadre', (el) => { C.afficherCadre = el.checked; sauverMateriel(); });
  $<HTMLInputElement>('#m-rot')?.addEventListener('input', (e) => {
    C.rotation = parseInt((e.target as HTMLInputElement).value, 10);
    $('#m-rot-val').textContent = `${C.rotation}°`;
    sauverMateriel();
  });
  $('#m-zoom').addEventListener('click', () => {
    if (!champ) return;
    etat.vue.fov = Math.max(champ.largeur, champ.hauteur) * 1.6;
    limiterVue();
    demanderRendu();
  });
  document.querySelectorAll<HTMLElement>('[data-suppr]').forEach((b) => b.addEventListener('click', () => {
    const [genre, id] = b.dataset.suppr!.split(':') as ['instruments' | 'oculaires' | 'cameras', string];
    (M[genre] as { id: string }[]).splice((M[genre] as { id: string }[]).findIndex((x) => x.id === id), 1);
    if (C.instrument === id) C.instrument = M.instruments[0]?.id ?? null;
    if (C.accessoire === id) C.accessoire = M.oculaires[0]?.id ?? M.cameras[0]?.id ?? null;
    sauverMateriel();
    afficherMateriel();
  }));
  const form = (sel: string, f: (d: Record<string, string>) => void) => $<HTMLFormElement>(sel).addEventListener('submit', (e) => {
    e.preventDefault();
    f(Object.fromEntries(new FormData(e.target as HTMLFormElement)) as Record<string, string>);
    sauverMateriel();
    afficherMateriel();
  });
  form('#f-inst', (d) => {
    const focale = +d.focale, diametre = +d.diametre || (d.fd ? focale / +d.fd : 0);
    if (!diametre) return;
    const id = nouvelId('i');
    M.instruments.push({ id, nom: d.nom, type: d.type as 'telescope' | 'objectif', diametre: Math.round(diametre * 10) / 10, focale });
    C.instrument = id;
  });
  form('#f-ocu', (d) => { const id = nouvelId('oc'); M.oculaires.push({ id, nom: d.nom, focale: +d.focale, champApparent: +d.champApparent }); C.accessoire = id; });
  form('#f-cam', (d) => { const id = nouvelId('c'); M.cameras.push({ id, nom: d.nom, largeur: +d.largeur, hauteur: +d.hauteur, pixel: +d.pixel }); C.accessoire = id; });
}

// ---------------------------------------------------------------- Objets (catalogues et filtres)

function sauverFiltre() {
  ecrire('filtreDso', etat.filtre);
  demanderRendu();
}

function afficherObjets() {
  const F = etat.filtre;
  const nb = (c: string) => objets.reduce((n, o) => n + (o.cats.has(c) ? 1 : 0), 0);
  $('#objets-filtres').innerHTML = `
    <div class="segments" role="radiogroup">
      ${([['tout', 'Tout'], ['visuel', 'Visuel'], ['photo', 'Astrophoto grand champ']] as [Mode, string][]).map(([m, t]) =>
        `<button data-mode="${m}" class="${F.mode === m ? 'actif' : ''}">${t}</button>`).join('')}
    </div>
    <p class="note">${F.mode === 'visuel' ? `Objets assez brillants pour votre instrument${champ ? ` (magnitude ≤ ${(champ.magLimite - 1.5).toFixed(1)})` : ''}, sans les nébuleuses trop faibles.`
      : F.mode === 'photo' ? `Objets assez grands pour votre champ${champ?.type === 'photo' ? ` (${fmtAngle(champ.largeur)} de large)` : ''}, nébuleuses diffuses et sombres comprises.`
      : 'Tous les objets des catalogues cochés.'}</p>
    <div class="cats">${CATALOGUES.map(([c, t]) => `<label><input type="checkbox" data-cat="${c}" ${F.catalogues[c] ? 'checked' : ''}/> ${t} <small>${nb(c)}</small></label>`).join('')}</div>`;
  document.querySelectorAll<HTMLElement>('[data-mode]').forEach((b) => b.addEventListener('click', () => {
    F.mode = b.dataset.mode as Mode; sauverFiltre(); afficherObjets();
  }));
  document.querySelectorAll<HTMLInputElement>('[data-cat]').forEach((cb) => cb.addEventListener('change', () => {
    F.catalogues[cb.dataset.cat!] = cb.checked; sauverFiltre(); listerObjets();
  }));
  listerObjets();
}

function listerObjets() {
  const m = matriceEqjHor(etat.date, etat.lieu);
  const hMin = parseFloat($<HTMLSelectElement>('#objets-hmin').value);
  const res: { o: Dso; i: number; alt: number; az: number }[] = [];
  objets.forEach((o, i) => {
    if (!accepte(o, etat.filtre, champ)) return;
    const { az, alt } = azAltDeVec(mul(m, o.v));
    if (alt >= hMin) res.push({ o, i, alt, az });
  });
  const tri = $<HTMLSelectElement>('#objets-tri').value;
  res.sort((a, b) => tri === 'mag' ? a.o.mag - b.o.mag : tri === 'taille' ? b.o.maj - a.o.maj : b.alt - a.alt);
  $('#objets-compte').textContent = `${res.length} objet${res.length > 1 ? 's' : ''} au-dessus de ${hMin}° à ${fmtHeure(etat.date)}`;
  const ul = $<HTMLUListElement>('#objets-liste');
  ul.innerHTML = res.slice(0, 300).map(({ o, i, alt, az }) => `
    <li data-i="${i}"><span>${esc(titreDso(o))}<small>${NOMS_FAMILLES[o.famille]} · ${o.mag < 99 ? 'mag ' + o.mag.toFixed(1) : 'mag —'}${o.maj ? ' · ' + fmtAngle(o.maj / 60) : ''}</small></span>
    <small class="alt">${alt.toFixed(0)}° ${pointCardinal(az)}</small></li>`).join('');
  ul.querySelectorAll<HTMLElement>('li').forEach((li) => li.addEventListener('click', () => {
    const i = +li.dataset.i!;
    etat.selection = { type: 'dso', index: i, v: objets[i].v };
    const o = objets[i];
    const taille = Math.max(o.maj / 60 * 4, champ ? Math.max(champ.largeur, champ.hauteur) * 1.6 : 2);
    centrerSur(o.v, Math.min(60, taille));
    afficherInfo();
    if (window.innerWidth < 700) $('#panneau-objets').hidden = true;
  }));
}
$('#objets-hmin').addEventListener('change', listerObjets);
$('#objets-tri').addEventListener('change', listerObjets);

// Temps
const pas = (min: number) => () => changerDate(new Date(etat.date.getTime() + min * 60e3));
$('#t-moins-h').addEventListener('click', pas(-60));
$('#t-moins-10').addEventListener('click', pas(-10));
$('#t-plus-10').addEventListener('click', pas(10));
$('#t-plus-h').addEventListener('click', pas(60));
$('#t-plus-j').addEventListener('click', pas(1440));
$('#direct').addEventListener('click', () => changerDate(new Date(), true));
$('#heure').addEventListener('click', () => {
  const inp = $<HTMLInputElement>('#date-input');
  const d = new Date(etat.date.getTime() - etat.date.getTimezoneOffset() * 60e3);
  inp.value = d.toISOString().slice(0, 16);
  inp.showPicker?.();
  inp.focus();
});
$<HTMLInputElement>('#date-input').addEventListener('change', (e) => {
  const v = (e.target as HTMLInputElement).value;
  if (v) changerDate(new Date(v));
});

// ---------------------------------------------------------------- Démarrage

window.addEventListener('resize', demanderRendu);

(async () => {
  try {
    donnees = await chargerDonnees();
  } catch {
    $('#chargement').textContent = 'Impossible de charger les données du ciel.';
    return;
  }
  genitifs = new Map(donnees.constellations.map((c) => [c.id, c.gen]));
  try { objets = await chargerDso(); } catch { objets = []; }
  calculer();
  construireIndex();
  $('#chargement').hidden = true;
  if (!localStorage.getItem('lieu')) $('#panneau-lieu').hidden = false, remplirLieu();
  requestAnimationFrame(boucle);
})();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register(new URL('sw.js', document.baseURI)).catch(() => {});
}

// Pour les tests manuels dans la console
Object.assign(window, { etat, vecRaDec });
