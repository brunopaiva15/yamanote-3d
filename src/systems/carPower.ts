// L'alimentation de bord pendant une coupure de caténaire, isolée du cycle
// station.
//
// Une lumière qui s'éteint en fondu ne dit rien : ça ressemble à une nuit qui
// tombe, pas à une panne. Une caténaire qui lâche, ça CLIGNOTE - et c'est à ce
// clignotement qu'on reconnaît une panne d'alimentation, avant même de se
// demander pourquoi le train ralentit.
//
// Ce qui se passe réellement, et qui explique la forme des courbes : le
// convertisseur de bord ne s'arrête pas avec la caténaire, il continue de
// tourner sur l'énergie stockée dans ses condensateurs. La tension s'effondre,
// il décroche, se réamorce sur ce qui reste, décroche encore - deux ou trois
// fois, de plus en plus court -, puis il n'y a plus rien à réamorcer. Les tubes
// fluorescents suivent : ils s'éteignent et se rallument au rythme des
// décrochages, jusqu'au dernier.
//
// Au retour, c'est la manœuvre inverse et elle est plus lente : les contacteurs
// se referment un par un, chacun donnant un éclat bref avant de retomber, puis
// ça tient et les tubes montent doucement en puissance - un fluorescent
// n'atteint pas son plein flux d'un coup.
//
// Les deux séquences sont écrites en images-clés plutôt qu'en formules : on les
// LIT, et on les règle en déplaçant un chiffre. Le module n'a aucune
// dépendance, donc Node l'exécute tel quel - c'est ce qui rend la forme du
// clignotement testable sans harnais (tests/carPower.test.ts).

/** Une image de la séquence : temps depuis le début (s), niveau visé (0..1). */
export type PowerFrame = readonly [t: number, level: number];

/**
 * Perte de la caténaire. Trois décrochages du convertisseur, de plus en plus
 * brefs et de moins en moins hauts, puis le noir - et, une seconde plus tard,
 * un dernier soubresaut sans lendemain.
 */
export const POWER_CUT: readonly PowerFrame[] = [
  [0, 1],
  [0.07, 1],
  [0.09, 0.24], // premier décrochage
  [0.15, 0.2],
  [0.18, 0.92], // il se réamorce
  [0.3, 0.86],
  [0.33, 0.08], // deuxième
  [0.42, 0.06],
  [0.45, 0.62],
  [0.55, 0.55],
  [0.58, 0.03], // troisième
  [0.78, 0.02],
  [0.82, 0.34], // ce qu'il restait dans les condensateurs
  [0.9, 0.28],
  [0.93, 0],
  [1.7, 0],
  [1.74, 0.16], // dernier soubresaut, sans lendemain
  [1.82, 0],
];

/**
 * Retour de la tension. Deux fermetures de contacteur qui ne tiennent pas, une
 * troisième qui tient, puis la montée douce des tubes - près de deux secondes,
 * parce que c'est le temps qu'un fluorescent met à donner tout son flux.
 */
export const POWER_RESTORE: readonly PowerFrame[] = [
  [0, 0],
  [0.1, 0],
  [0.13, 0.5], // premier contacteur
  [0.21, 0.46],
  [0.24, 0.02],
  [0.52, 0.02],
  [0.55, 0.74], // deuxième
  [0.64, 0.7],
  [0.67, 0.04],
  [0.95, 0.04],
  [0.99, 0.42], // le troisième tient
  [1.15, 0.5],
  [2.9, 1], // les tubes montent en puissance
];

// --- Les petits bruits électriques ---------------------------------------
//
// Une coupure de courant est un événement SONORE avant d'être un événement
// visuel : ce qui se passe dans un wagon qui perd sa caténaire, c'est du
// matériel électrique qui travaille - un disjoncteur qui s'ouvre, des
// contacteurs qui battent, des tubes qui essaient de se réamorcer et
// grésillent, un convertisseur dont le sifflement s'effondre.
//
// Ces instants sont déclarés ICI, à côté des images-clés de la lumière, et pas
// dans le moteur audio. C'est la seule façon de garantir qu'ils restent
// ensemble : un claquement qui arrive un dixième de seconde après son
// clignotement se lit comme un deuxième événement, et l'illusion tombe. Régler
// la courbe, c'est régler le son en même temps.

export type PowerSoundKind =
  /** Le disjoncteur principal s'ouvre, sous le plancher : le coup sourd. */
  | 'breaker'
  /** Un contacteur claque - fermeture qui tient, ou qui retombe. */
  | 'relay'
  /** Un tube essaie de se réamorcer : grésillement bref et aigu. */
  | 'strike'
  /** Ce qui reste d'énergie s'échappe : crépitement ténu, sans coup. */
  | 'arc'
  /** Le sifflement du convertisseur s'effondre. */
  | 'whineDown'
  /** …et remonte, quand il se réamorce pour de bon. */
  | 'whineUp'
  /** Les turbines de climatisation repartent en charge. */
  | 'fans';

/** Un petit événement électrique : instant depuis le début de la séquence (s). */
export type PowerSound = readonly [t: number, kind: PowerSoundKind];

/** Ce qu'on entend pendant la perte de la caténaire. */
export const POWER_CUT_SOUNDS: readonly PowerSound[] = [
  [0, 'breaker'],
  [0.02, 'whineDown'],
  [0.09, 'strike'], // premier décrochage
  [0.18, 'strike'], // il se réamorce
  [0.33, 'relay'],
  [0.34, 'strike'], // deuxième
  [0.45, 'strike'],
  [0.58, 'relay'],
  [0.59, 'strike'], // troisième
  [0.82, 'arc'],
  [0.93, 'arc'],
  [1.74, 'strike'], // le soubresaut sans lendemain
];

/** Ce qu'on entend au retour de la tension. */
export const POWER_RESTORE_SOUNDS: readonly PowerSound[] = [
  [0.13, 'relay'],
  [0.14, 'strike'], // première fermeture, qui ne tient pas
  [0.24, 'arc'],
  [0.55, 'relay'],
  [0.56, 'strike'], // deuxième
  [0.67, 'arc'],
  [0.99, 'relay'], // celle qui tient
  [1, 'strike'],
  [1.01, 'whineUp'],
  [1.16, 'strike'], // les tubes s'accrochent
  [1.9, 'fans'],
];

/** Table des sons associée à une séquence de lumière. */
function soundsFor(seq: readonly PowerFrame[]): readonly PowerSound[] {
  return seq === POWER_CUT ? POWER_CUT_SOUNDS : POWER_RESTORE_SOUNDS;
}

/**
 * Délai avant que le relais de secours ne bascule (s). Les lampes de secours
 * n'accompagnent PAS le clignotement : elles attendent que l'alimentation
 * normale soit vraiment perdue. Un éclairage de secours qui battrait en
 * opposition de phase avec les néons ne ressemblerait à rien.
 */
export const EMERGENCY_LAMP_DELAY = 0.95;
/** Montée des lampes de secours une fois le relais basculé (s). */
export const EMERGENCY_LAMP_RISE = 0.45;
/** Retombée au retour de la tension (s) : plus lente, pour ne pas laisser de trou. */
export const EMERGENCY_LAMP_FALL = 0.9;

/** Niveau de la séquence à l'instant t, par interpolation entre deux images. */
export function samplePower(seq: readonly PowerFrame[], t: number): number {
  if (t <= seq[0][0]) return seq[0][1];
  for (let i = 1; i < seq.length; i++) {
    const [t1, v1] = seq[i];
    if (t > t1) continue;
    const [t0, v0] = seq[i - 1];
    const span = t1 - t0;
    return span <= 0 ? v1 : v0 + ((v1 - v0) * (t - t0)) / span;
  }
  return seq[seq.length - 1][1];
}

/** Durée totale d'une séquence (s). */
export function powerSeqEnd(seq: readonly PowerFrame[]): number {
  return seq[seq.length - 1][0];
}

export interface CarPowerState {
  /** Alimentation normale (0..1) : néons, bandeau LED, dalles, onduleur, clim. */
  power: number;
  /** Éclairage de secours (0..1), sur les batteries de bord. */
  emergency: number;
  /** Séquence en cours, `null` = alimentation stable (0 ou 1). */
  seq: readonly PowerFrame[] | null;
  /** Chrono dans la séquence en cours (s). */
  t: number;
  /** Vrai tant que la rame vit sur ses batteries. */
  onBattery: boolean;
}

export function createCarPower(): CarPowerState {
  return { power: 1, emergency: 0, seq: null, t: 0, onBattery: false };
}

/** La caténaire lâche : l'affaissement commence. */
export function cutPower(s: CarPowerState): void {
  s.seq = POWER_CUT;
  s.t = 0;
  s.onBattery = false;
}

/** La tension revient : les contacteurs se referment. */
export function restorePower(s: CarPowerState): void {
  s.seq = POWER_RESTORE;
  s.t = 0;
  // Le relais de secours retombe dès que la tension revient : les lampes
  // s'effacent pendant que les néons remontent, sans laisser de trou.
  s.onBattery = false;
}

/** Remet l'alimentation au plein, sans séquence : entrée en jeu, reset. */
export function resetCarPower(s: CarPowerState): void {
  s.power = 1;
  s.emergency = 0;
  s.seq = null;
  s.t = 0;
  s.onBattery = false;
}

/**
 * Un pas de la séquence en cours, et des lampes de secours qui la suivent.
 *
 * `heard` recueille les petits bruits électriques que ce pas vient de
 * traverser - le module ne connaît pas le moteur audio, il dit seulement ce
 * qu'il y avait à entendre. Un pas long (frame lente) en récolte plusieurs
 * d'un coup, ce qui vaut mieux que d'en perdre : au pire ils se bousculent,
 * au mieux la panne reste sonore même à quinze images par seconde.
 */
export function stepCarPower(s: CarPowerState, dt: number, heard?: PowerSoundKind[]): void {
  if (s.seq) {
    const before = s.t;
    s.t += dt;
    // Fenêtre semi-ouverte [before, t) : chaque bruit sort une fois et une
    // seule, et celui posé à l'instant zéro sort dès le premier pas - c'est le
    // disjoncteur, il ne peut pas être en retard sur sa propre coupure.
    if (heard) {
      for (const [t, kind] of soundsFor(s.seq)) {
        if (t >= before && t < s.t) heard.push(kind);
      }
    }
    s.power = samplePower(s.seq, s.t);
    // Le relais de secours bascule pendant la chute, une fois les décrochages
    // passés - pas avant, ou il éclairerait par-dessus des néons encore vifs.
    if (s.seq === POWER_CUT && s.t >= EMERGENCY_LAMP_DELAY) s.onBattery = true;
    if (s.t >= powerSeqEnd(s.seq)) {
      s.power = s.seq[s.seq.length - 1][1];
      s.seq = null;
    }
  }
  const target = s.onBattery ? 1 : 0;
  const rate = dt / (target > s.emergency ? EMERGENCY_LAMP_RISE : EMERGENCY_LAMP_FALL);
  const d = target - s.emergency;
  s.emergency += Math.max(-rate, Math.min(rate, d));
}
