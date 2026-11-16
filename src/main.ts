import './style.css';
import {
  matriceEqjHor, positionsCorps, evenements, evenementsFixe, nuit, constellationDe, versDate,
  mul, azAltDeVec, avecRefraction, vecRaDec, type Lieu, type Vec3, type PositionCorps, type Evenements,
} from './astro';
import { chargerDonnees, nomEtoile, type DonneesCiel } from './data';
import { Projecteur, dessiner, type Vue, type Options, type Pointable } from './sky';

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
  selection: null as null | { type: 'etoile' | 'corps'; index: number; v: Vec3 },
};

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
    : [donnees.etoiles.vec[meilleur.index * 3], donnees.etoiles.vec[meilleur.index * 3 + 1], donnees.etoiles.vec[meilleur.index * 3 + 2]];
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
    <tr><th>Magnitude</th><td>${mag.toFixed(2)}</td></tr>
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

interface Resultat { label: string; type: string; v: () => Vec3; select?: () => void; fov?: number }
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
  (window as unknown as { _norm: typeof norm })._norm = norm;
  const input = $<HTMLInputElement>('#recherche');
  const liste = $<HTMLUListElement>('#resultats');
  input.addEventListener('input', () => {
    const q = norm(input.value.trim());
    liste.innerHTML = '';
    if (q.length < 2) return;
    const r = index.filter((x) => norm(x.label).includes(q)).slice(0, 12);
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
