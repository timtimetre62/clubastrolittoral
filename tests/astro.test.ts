import { describe, it, expect } from 'vitest';
import * as A from 'astronomy-engine';
import { matriceEqjHor, mul, vecRaDec, azAltDeVec, positionsCorps, nuit, versDate, constellationDe, evenementsFixe } from '../src/astro';

const lieu = { lat: 50.73, lon: 1.6, alt: 10 }; // Boulogne-sur-Mer
const date = new Date('2026-11-16T21:00:00Z');

describe('changement de repère J2000 -> horizontal', () => {
  it('donne la même hauteur/azimut que astronomy-engine pour Sirius et Polaris', () => {
    const m = matriceEqjHor(date, lieu);
    for (const [ra, dec] of [[101.287, -16.716], [37.95, 89.264], [279.23, 38.78]]) {
      const { az, alt } = azAltDeVec(mul(m, vecRaDec(ra, dec)));
      // astronomy-engine.Horizon attend des coordonnées de la date
      const d = versDate(ra, dec, date);
      const h = A.Horizon(date, new A.Observer(lieu.lat, lieu.lon, lieu.alt), d.ra / 15, d.dec);
      expect(alt).toBeCloseTo(h.altitude, 2);
      const daz = Math.abs(((az - h.azimuth + 540) % 360) - 180);
      expect(daz * Math.cos(alt * Math.PI / 180)).toBeLessThan(0.01);
    }
  });
});

describe('système solaire', () => {
  it('calcule les 9 corps avec des valeurs plausibles', () => {
    const p = positionsCorps(date, lieu);
    expect(p).toHaveLength(9);
    const lune = p.find((x) => x.corps.nom === 'Lune')!;
    expect(lune.diametre).toBeGreaterThan(1700);
    expect(lune.diametre).toBeLessThan(2100);
    const jup = p.find((x) => x.corps.nom === 'Jupiter')!;
    expect(jup.mag).toBeLessThan(-1.5);
  });
});

describe('la nuit', () => {
  it('ordonne coucher, crépuscules et aube', () => {
    const n = nuit(date, lieu);
    const seq = [n.coucherSoleil, n.finCivil, n.finNautique, n.finAstro, n.debutAstro, n.debutNautique, n.debutCivil, n.leverSoleil];
    seq.forEach((d) => expect(d).not.toBeNull());
    for (let i = 1; i < seq.length; i++) expect(seq[i]!.getTime()).toBeGreaterThan(seq[i - 1]!.getTime());
    // Mi-novembre à Boulogne : coucher vers 17h05 heure de Paris (16h05 UTC)
    const m = n.coucherSoleil!.getUTCHours() * 60 + n.coucherSoleil!.getUTCMinutes();
    expect(m).toBeGreaterThan(15 * 60 + 50);
    expect(m).toBeLessThan(16 * 60 + 20);
  });
});

describe('divers', () => {
  it('trouve la bonne constellation', () => {
    expect(constellationDe(83.82, -5.39)).toBe('Ori'); // M42
    expect(constellationDe(10.68, 41.27)).toBe('And'); // M31
  });
  it('Polaris est circumpolaire, Sirius se lève', () => {
    expect(evenementsFixe(37.95, 89.264, lieu, date).circumpolaire).toBe(true);
    expect(evenementsFixe(101.287, -16.716, lieu, date).lever).not.toBeNull();
  });
});
