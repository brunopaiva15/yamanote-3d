// L'alimentation de bord pendant une coupure de caténaire
// (src/systems/carPower.ts).
//
// Le module n'a aucune dépendance : Node 22 l'exécute tel quel (effacement de
// types natif), sans compilateur ni harnais — même régime que trainPhysics.
//
// Ce qui se joue ici n'est pas une constante mais une LECTURE : une lumière qui
// s'éteint en fondu ressemble à une nuit qui tombe, pas à une panne. Les
// assertions décrivent donc ce que l'œil doit pouvoir compter — des
// extinctions franches, des retours, et un éclairage de secours qui ne bat
// jamais en opposition de phase avec les néons.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EMERGENCY_LAMP_DELAY,
  POWER_CUT,
  POWER_CUT_SOUNDS,
  POWER_RESTORE,
  POWER_RESTORE_SOUNDS,
  createCarPower,
  cutPower,
  powerSeqEnd,
  restorePower,
  samplePower,
  stepCarPower,
  type CarPowerState,
  type PowerSoundKind,
} from '../src/systems/carPower.ts';

/** Seuil au-dessous duquel une dalle LCD est éteinte (voir three/Screens). */
const DARK = 0.45;

/** Déroule une séquence au pas de la boucle 60 fps et enregistre chaque frame. */
function run(begin: (s: CarPowerState) => void, span: number) {
  const s = createCarPower();
  // Une coupure part d'une rame alimentée, un retour d'une rame éteinte.
  if (begin === restorePower) {
    s.power = 0;
    s.emergency = 1;
    s.onBattery = true;
  }
  begin(s);
  const dt = 1 / 60;
  const power: number[] = [];
  const emergency: number[] = [];
  const times: number[] = [];
  for (let t = 0; t < span; t += dt) {
    stepCarPower(s, dt);
    power.push(s.power);
    emergency.push(s.emergency);
    // L'instant d'une image est celui d'APRÈS son pas : c'est ce qu'a vu
    // stepCarPower, et donc ce que la frame affiche.
    times.push(t + dt);
  }
  return { s, power, emergency, times };
}

/** Nombre de passages du niveau au-dessus puis au-dessous du seuil d'extinction. */
function blinks(levels: number[]): number {
  let count = 0;
  let lit = levels[0] > DARK;
  for (const v of levels) {
    const now = v > DARK;
    if (now !== lit) {
      if (!now) count++; // on ne compte que les extinctions
      lit = now;
    }
  }
  return count;
}

test('la coupure clignote avant de s’éteindre, elle ne fond pas', () => {
  const { s, power } = run(cutPower, 2.4);
  // Trois décrochages au moins : c'est ce qui distingue une panne d'un fondu.
  // Sous ce compte, l'effet se lit comme une variation d'éclairage.
  assert.ok(blinks(power) >= 3, `seulement ${blinks(power)} extinction(s)`);
  // Et ça remonte vraiment entre deux : un clignotement qui ne repasse jamais
  // au-dessus du seuil n'est pas un clignotement, c'est un escalier.
  assert.ok(power.filter((v) => v > DARK).length > 20, 'les retours sont trop courts');
  // À la fin, plus rien, et la séquence est retombée.
  assert.equal(s.power, 0);
  assert.equal(s.seq, null);
});

test('la coupure ne s’éteint pas tout de suite : le premier décrochage se voit', () => {
  // Une panne qui commence par le noir ne laisse rien à voir. Le premier
  // décrochage doit tomber assez tôt pour être lié au reste de l'événement,
  // et assez tard pour qu'on ait vu le wagon éclairé juste avant.
  const first = POWER_CUT.findIndex(([, v]) => v <= DARK);
  assert.ok(first > 0);
  const [t] = POWER_CUT[first];
  assert.ok(t > 0.05 && t < 0.2, `premier décrochage à ${t} s`);
});

test('le retour bat deux fois avant de tenir, puis monte doucement', () => {
  const { s, power } = run(restorePower, 3.2);
  // Deux fermetures qui retombent : autant d'extinctions après un éclat.
  assert.ok(blinks(power) >= 2, `seulement ${blinks(power)} retombée(s)`);
  assert.equal(s.power, 1);
  assert.equal(s.seq, null);
  // La fin est une montée, pas une marche : sur la dernière seconde, le niveau
  // ne redescend jamais et gagne du terrain.
  const tail = power.slice(Math.floor(power.length * 0.55));
  for (let i = 1; i < tail.length; i++) {
    assert.ok(tail[i] >= tail[i - 1] - 1e-9, 'la remontée finale redescend');
  }
  assert.ok(tail[tail.length - 1] - tail[0] > 0.3, 'la remontée finale est trop courte');
  // Et elle est LENTE : un fluorescent ne donne pas son plein flux d'un coup.
  assert.ok(powerSeqEnd(POWER_RESTORE) > 2, 'le retour est trop expéditif');
});

test('les lampes de secours attendent que les néons aient vraiment lâché', () => {
  const { emergency, power, times } = run(cutPower, 2.4);
  // Pendant tout le clignotement, le secours reste éteint : sans ce délai il
  // s'allumerait à chaque décrochage et s'éteindrait à chaque réamorçage,
  // exactement en opposition de phase avec les néons.
  for (let i = 0; i < times.length; i++) {
    if (times[i] >= EMERGENCY_LAMP_DELAY) break;
    assert.ok(emergency[i] < 0.02, `secours allumé à ${times[i].toFixed(2)} s`);
  }
  // Puis il prend le relais, une fois le wagon noir.
  assert.ok(emergency[emergency.length - 1] > 0.95, 'le secours ne s’allume jamais');
  assert.ok(power[power.length - 1] < 0.02);
});

test('le secours s’efface au retour de la tension, sans laisser de trou', () => {
  const { s, emergency, power } = run(restorePower, 3.2);
  assert.ok(emergency[0] > 0.9, 'le secours devrait être allumé au départ');
  assert.ok(s.emergency < 0.02, 'le secours reste allumé après le retour');
  // Aucun instant où les deux éclairages sont éteints en même temps : le wagon
  // ne doit jamais passer par un noir complet PENDANT que le courant revient.
  for (let i = 0; i < power.length; i++) {
    assert.ok(power[i] + emergency[i] > 0.02, `trou noir à l’image ${i}`);
  }
});

test('l’échantillonnage tient aux bords et entre deux images', () => {
  assert.equal(samplePower(POWER_CUT, -1), 1);
  assert.equal(samplePower(POWER_CUT, 999), 0);
  assert.equal(samplePower(POWER_RESTORE, 999), 1);
  // Interpolation linéaire : à mi-chemin de la dernière montée, on est entre
  // les deux bornes et strictement dedans.
  const mid = samplePower(POWER_RESTORE, (1.15 + 2.9) / 2);
  assert.ok(mid > 0.5 && mid < 1, `niveau intermédiaire : ${mid}`);
});

// --- Les petits bruits électriques ---------------------------------------

/** Déroule une séquence à un pas donné et récolte tous les bruits émis. */
function heardAt(begin: (s: CarPowerState) => void, dt: number, span: number): PowerSoundKind[] {
  const s = createCarPower();
  if (begin === restorePower) {
    s.power = 0;
    s.emergency = 1;
    s.onBattery = true;
  }
  begin(s);
  const heard: PowerSoundKind[] = [];
  for (let t = 0; t < span; t += dt) stepCarPower(s, dt, heard);
  return heard;
}

test('chaque bruit électrique sort une fois, et une seule', () => {
  const cut = heardAt(cutPower, 1 / 60, 3);
  assert.equal(cut.length, POWER_CUT_SOUNDS.length);
  assert.deepEqual(cut, POWER_CUT_SOUNDS.map(([, k]) => k));
  const restore = heardAt(restorePower, 1 / 60, 3.5);
  assert.equal(restore.length, POWER_RESTORE_SOUNDS.length);
  assert.deepEqual(restore, POWER_RESTORE_SOUNDS.map(([, k]) => k));
});

test('le disjoncteur sonne dès le premier pas : il ne peut pas être en retard', () => {
  const s = createCarPower();
  cutPower(s);
  const heard: PowerSoundKind[] = [];
  stepCarPower(s, 1 / 60, heard);
  assert.equal(heard[0], 'breaker');
});

test('une frame lente bouscule les bruits, elle n’en perd aucun', () => {
  // Le rendu logiciel des scripts tourne à quatre images par seconde, et une
  // machine chargée n'en fait pas beaucoup plus. Un pas grossier doit récolter
  // toute la séquence d'un coup plutôt que de la sauter : au pire ça se
  // bouscule, au mieux la panne reste sonore.
  for (const dt of [1 / 30, 1 / 8, 0.4]) {
    const cut = heardAt(cutPower, dt, 3);
    assert.equal(cut.length, POWER_CUT_SOUNDS.length, `pas de ${dt} s`);
  }
});

test('chaque commutation tombe sur une image-clé de la lumière', () => {
  // C'est toute la raison d'être de la table : un claquement qui n'accompagne
  // aucun changement de lumière se lit comme un deuxième événement. On tolère
  // trois centièmes et demi — le temps qu'un contacteur mette à faire son arc.
  //
  // Un seul bruit y échappe, et c'est justifié : `fans` n'est pas une
  // commutation mais sa CONSÉQUENCE mécanique, les turbines qui remontent en
  // charge une seconde après que le contacteur a tenu. Elle n'a aucune raison
  // de tomber sur un éclat de lumière — elle arrive en plein milieu de la
  // remontée douce des tubes, et c'est très bien ainsi.
  const near = (seq: readonly (readonly [number, number])[], t: number) =>
    seq.some(([kt]) => Math.abs(kt - t) <= 0.035);
  for (const [t, kind] of POWER_CUT_SOUNDS) {
    if (kind === 'fans') continue;
    assert.ok(near(POWER_CUT, t), `coupure : ${kind} à ${t} s n’accompagne rien`);
  }
  for (const [t, kind] of POWER_RESTORE_SOUNDS) {
    if (kind === 'fans') continue;
    assert.ok(near(POWER_RESTORE, t), `retour : ${kind} à ${t} s n’accompagne rien`);
  }
});

test('les tables de bruits sont dans l’ordre et dans leur séquence', () => {
  for (const [table, seq, name] of [
    [POWER_CUT_SOUNDS, POWER_CUT, 'coupure'],
    [POWER_RESTORE_SOUNDS, POWER_RESTORE, 'retour'],
  ] as const) {
    for (let i = 1; i < table.length; i++) {
      assert.ok(table[i][0] >= table[i - 1][0], `${name} : table désordonnée`);
    }
    // Un bruit posé après la fin de la séquence ne sortirait jamais.
    assert.ok(table[table.length - 1][0] < powerSeqEnd(seq), `${name} : bruit hors séquence`);
  }
});
