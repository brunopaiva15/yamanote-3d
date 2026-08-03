// CE QUI BOUGE ENTRE DEUX ÉCRANS (three/lineScreenAnim).
//
// Ces tests EXÉCUTENT le calendrier des deux animations reprises sur une
// capture de l'afficheur réel (Yamanote, 日暮里, plan de boucle anglais puis vue
// rapprochée japonaise) : le fondu enchaîné d'une page à la suivante, et la
// remontée du vert sur la bande de la vue rapprochée.
//
// Ce qu'ils protègent tient en trois points, et chacun d'eux est une manière
// précise de RATER l'animation plutôt qu'une propriété générale :
//
//  1. ce qui déclenche un fondu. Un afficheur qui refond à chaque battement du
//     clignotant ou à chaque minute affichée n'est pas « animé », il est flou :
//     seul un changement de PAGE fond ;
//  2. l'arithmétique du fondu. On ne garde aucune copie de l'image d'avant - on
//     verse à chaque battement une part de la nouvelle sur la dalle, qui porte
//     déjà le mélange des précédentes. La suite des parts versées doit laisser
//     exactement `1 - avancement` de l'ancienne, sinon le fondu s'arrête à
//     mi-chemin ou saute la fin ;
//  3. qui se remplit. La vue rapprochée, et elle seule : l'anneau du plan de
//     boucle est la ligne entière, pas la voie devant soi, et la capture le
//     montre plein d'un bout à l'autre de son passage.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BAND_FILL_DELAY,
  BAND_FILL_TIME,
  MOTION_STEP,
  PAGE_FADE,
  bandFill,
  bandFills,
  newScreenAnim,
  resetScreenAnim,
  stepScreenAnim,
} from '../src/three/lineScreenAnim.ts';
import type { LineScreenState } from '../src/three/lineScreenStates.ts';

/**
 * Fait tourner l'afficheur pendant `steps` battements sur la même page, et rend
 * ce qui reste de l'IMAGE D'AVANT à chaque battement.
 *
 * C'est la seule mesure qui dise quelque chose du fondu : la part versée à un
 * battement ne se lit pas seule, elle se compose avec toutes celles d'avant.
 */
function residues(page: string, steps: number): number[] {
  const a = newScreenAnim();
  stepScreenAnim(a, 'page-precedente', false, MOTION_STEP);
  let old = 1;
  const out: number[] = [];
  for (let i = 0; i < steps; i++) {
    old *= 1 - stepScreenAnim(a, page, false, MOTION_STEP).blend;
    out.push(old);
  }
  return out;
}

/**
 * Ce qui reste de l'image d'avant après `rest` secondes de fondu, versées en
 * `steps` pas égaux - le premier pas de la page, lui, est toujours le même.
 */
function residualAfter(rest: number, steps: number): number {
  const a = newScreenAnim();
  stepScreenAnim(a, 'page-precedente', false, MOTION_STEP);
  let old = 1 - stepScreenAnim(a, 'zoomJP', false, MOTION_STEP).blend;
  for (let i = 0; i < steps; i++) {
    old *= 1 - stepScreenAnim(a, 'zoomJP', false, rest / steps).blend;
  }
  return old;
}

test('la première page ne se fond pas : il n’y a rien sous elle', () => {
  const a = newScreenAnim();
  const first = stepScreenAnim(a, 'loopJP', false, MOTION_STEP);
  assert.equal(first.blend, 1);
  assert.equal(first.busy, false);
});

test('une page qui ne change pas ne refond pas', () => {
  const a = newScreenAnim();
  stepScreenAnim(a, 'loopJP', false, MOTION_STEP);
  // Le clignotant bat, l'horloge tourne : la PAGE, elle, est la même, et c'est
  // elle seule qu'on donne à `stepScreenAnim`.
  for (let i = 0; i < 40; i++) {
    const step = stepScreenAnim(a, 'loopJP', false, MOTION_STEP);
    assert.equal(step.blend, 1, `battement ${i}`);
    assert.equal(step.busy, false, `battement ${i}`);
  }
});

test('le fondu efface exactement l’image d’avant, et en PAGE_FADE secondes', () => {
  const left = residues('zoomJP', 12);
  // Décroissant, jamais négatif, et nul dès que le fondu est écoulé.
  for (let i = 1; i < left.length; i++) assert.ok(left[i] <= left[i - 1] + 1e-9);
  const done = Math.ceil(PAGE_FADE / MOTION_STEP);
  assert.ok(left[done - 2] > 0, 'le fondu se termine trop tôt');
  assert.ok(Math.abs(left[done - 1]) < 1e-9, 'le fondu ne se termine pas');
});

test('l’avancement du fondu suit le temps, pas le nombre de battements', () => {
  // La boucle de rendu n'a aucune cadence garantie : une même durée versée en
  // un pas ou en huit doit laisser exactement autant de l'image d'avant.
  const rest = PAGE_FADE / 2;
  const un = residualAfter(rest, 1);
  const huit = residualAfter(rest, 8);
  assert.ok(un > 0 && un < 1, `part restante : ${un}`);
  assert.ok(Math.abs(un - huit) < 1e-9, `${un} ≠ ${huit}`);
});

test('le fondu n’est pas escamoté par le réveil qui découvre la page', () => {
  // C'est le cas RÉEL, et il n'a rien d'un cas limite : hors animation, la
  // dalle ne se réveille que toutes les demi-secondes, soit quatre fois la
  // durée du fondu. Si ce demi-seconde-là comptait, le fondu serait terminé
  // avant sa première image et l'écran couperait comme avant.
  const a = newScreenAnim();
  stepScreenAnim(a, 'loopEN', false, 0.5);
  const first = stepScreenAnim(a, 'zoomJP', true, 0.5);
  assert.ok(first.blend > 0 && first.blend < 1, `part versée : ${first.blend}`);
  assert.equal(first.fill, 0, 'la bande doit arriver éteinte');
  assert.equal(first.busy, true);
  // Et il se termine bien, en pas fins, dans la durée annoncée.
  let old = 1 - first.blend;
  for (let i = 0; i < Math.ceil(PAGE_FADE / MOTION_STEP); i++) {
    old *= 1 - stepScreenAnim(a, 'zoomJP', true, MOTION_STEP).blend;
  }
  assert.ok(Math.abs(old) < 1e-9, `il reste ${old} de l’image d’avant`);
});

test('seule la vue rapprochée remplit sa bande', () => {
  const fills: LineScreenState[] = ['zoomJP', 'zoomEN'];
  const flat: LineScreenState[] = [
    'loopJP', 'loopEN', 'stationLayout', 'transfers', 'priority', 'manner',
    'trafficJP', 'trafficEN', 'securityJP', 'securityEN', 'brake', 'emergency', 'outage',
  ];
  for (const s of fills) assert.equal(bandFills(s), true, s);
  for (const s of flat) assert.equal(bandFills(s), false, s);
});

test('le vert part après un temps mort, monte sans reculer, et s’arrête plein', () => {
  assert.equal(bandFill(0), 0);
  assert.equal(bandFill(BAND_FILL_DELAY), 0);
  assert.equal(bandFill(BAND_FILL_DELAY + BAND_FILL_TIME), 1);
  assert.equal(bandFill(60), 1);
  let last = -1;
  for (let t = 0; t < BAND_FILL_DELAY + BAND_FILL_TIME + 0.5; t += MOTION_STEP) {
    const v = bandFill(t);
    assert.ok(v >= last, `recul à t=${t}`);
    assert.ok(v >= 0 && v <= 1, `hors bornes à t=${t}`);
    last = v;
  }
});

test('la vue rapprochée arrive la bande ÉTEINTE', () => {
  const a = newScreenAnim();
  stepScreenAnim(a, 'loopEN', false, MOTION_STEP);
  const first = stepScreenAnim(a, 'zoomJP', true, MOTION_STEP);
  assert.equal(first.fill, 0);
});

test('l’afficheur se dit occupé tant que le vert monte, et se tait après', () => {
  const a = newScreenAnim();
  stepScreenAnim(a, 'loopEN', false, MOTION_STEP);
  let t = 0;
  let full = -1;
  for (let i = 0; i < 200; i++) {
    const step = stepScreenAnim(a, 'zoomJP', true, MOTION_STEP);
    t += MOTION_STEP;
    // Le temps mort AVANT le départ du vert compte comme du mouvement : sans
    // lui, l'appelant s'endormirait et raterait le début du remplissage.
    if (t < BAND_FILL_DELAY + BAND_FILL_TIME) assert.equal(step.busy, true, `t=${t}`);
    if (step.fill >= 1 && full < 0) full = t;
    if (!step.busy) {
      assert.equal(step.fill, 1, 'la bande n’est pas pleine quand on s’arrête');
      break;
    }
  }
  assert.ok(full > 0 && full <= BAND_FILL_DELAY + BAND_FILL_TIME + MOTION_STEP);
});

test('les écrans sans bande ne retiennent pas l’appelant éveillé', () => {
  const a = newScreenAnim();
  stepScreenAnim(a, 'loopEN', false, MOTION_STEP);
  const step = stepScreenAnim(a, 'transfers', false, MOTION_STEP);
  assert.equal(step.fill, 1);
  // Le fondu, lui, occupe toujours : c'est la seule chose qui bouge sur un
  // écran fixe.
  assert.equal(step.busy, true);
  for (let i = 0; i < 20; i++) stepScreenAnim(a, 'transfers', false, MOTION_STEP);
  assert.equal(stepScreenAnim(a, 'transfers', false, MOTION_STEP).busy, false);
});

test('une dalle éteinte se rallume d’un coup, pas en fondu', () => {
  const a = newScreenAnim();
  stepScreenAnim(a, 'loopJP', false, MOTION_STEP);
  // Coupure de caténaire : la dalle est peinte en noir, elle ne montre plus de
  // page. Fondre depuis ce noir donnerait un allumage en douceur.
  resetScreenAnim(a);
  const back = stepScreenAnim(a, 'zoomEN', true, MOTION_STEP);
  assert.equal(back.blend, 1);
});
