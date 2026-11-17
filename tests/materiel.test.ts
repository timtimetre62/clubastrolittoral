import { describe, it, expect } from 'vitest';
import { calculerChamp, MATERIEL_DEFAUT, magLimiteInstrument, type Materiel } from '../src/materiel';

const avec = (instrument: string, accessoire: string, correcteur = 1): Materiel =>
  ({ ...MATERIEL_DEFAUT, config: { ...MATERIEL_DEFAUT.config, instrument, accessoire, correcteur } });

describe('calculs optiques', () => {
  it('Newton 200/1000 + oculaire 25 mm 52° : 40×, champ 1,3°, pupille 5 mm', () => {
    const c = calculerChamp(avec('i-200', 'oc-25'))!;
    expect(c.type).toBe('visuel');
    expect(c.grossissement).toBeCloseTo(40);
    expect(c.largeur).toBeCloseTo(1.3);
    expect(c.pupille).toBeCloseTo(5);
  });
  it('la Barlow 2× double le grossissement', () => {
    expect(calculerChamp(avec('i-200', 'oc-25', 2))!.grossissement).toBeCloseTo(80);
  });
  it('APS-C derrière un 135 mm : environ 9,4° × 6,3°, 6,6″/pixel', () => {
    const c = calculerChamp(avec('o-135', 'c-apsc'))!;
    expect(c.type).toBe('photo');
    expect(c.largeur).toBeCloseTo(9.43, 1);
    expect(c.hauteur).toBeCloseTo(6.31, 1);
    expect(c.echantillonnage).toBeCloseTo(6.57, 1);
  });
  it('magnitude limite d’un 200 mm ≈ 14,2', () => {
    expect(magLimiteInstrument(200)).toBeCloseTo(14.2, 1);
  });
});
