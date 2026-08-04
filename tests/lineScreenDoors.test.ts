// LE PICTOGRAMME DE PORTES DE L'ÉCRAN D'APPROCHE (three/lineScreenAnim).
//
// L'afficheur annonce le côté d'ouverture avec un pictogramme qui S'OUVRE : deux
// vantaux s'écartent, un triangle rouge sort du seuil, les vantaux se
// referment, et ça recommence. Le code n'en tenait que quatre images, posées au
// battement de la rame - à ce compte-là le geste ne se voit pas, on voit les
// sauts, et une porte qui se déplace par crans de dix pixels n'ouvre pas : elle
// se téléporte.
//
// Ces tests EXÉCUTENT le cycle, image fine par image fine. Ce qu'ils protègent
// tient en quatre points, et chacun est une manière précise de retomber dans
// l'animation d'avant plutôt qu'une propriété générale :
//
//  1. la CONTINUITÉ. Aucun pas ne doit faire un bond - ni au milieu du geste, ni
//     au raccord de la boucle, qui est l'endroit où l'on rate d'ordinaire une
//     animation cyclique ;
//  2. les BOUTS PLATS. Une porte qui part et s'arrête à pleine vitesse claque,
//     même quand elle met une demi-seconde à traverser l'écran : le premier et
//     le dernier pas de chaque geste doivent être plus courts que ceux du
//     milieu ;
//  3. le TRIANGLE, qui ne sort que d'une porte arrêtée grande ouverte. Pincé par
//     des vantaux qui se referment, il dirait le contraire de ce que l'écran
//     annonce ;
//  4. ce que voient les LECTEURS QUI NE SE RÉVEILLENT QU'AU BATTEMENT. Le plan
//     des correspondances porte le même triangle au-dessus de la case du
//     voyageur et ne se repeint que deux fois par seconde : il doit le trouver
//     sorti à un battement sur quatre, exactement comme avant.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ANIM_PERIOD,
  ANIM_PHASES,
  DOOR_CYCLE,
  MOTION_STEP,
  doorAperture,
  doorMarker,
  screenLoops,
} from '../src/three/lineScreenAnim.ts';
import type { LineScreenFrame } from '../src/three/lineScreenStates.ts';

/** Un pas fin, compté en phases : c'est l'unité dans laquelle vit `anim`. */
const STEP = MOTION_STEP / ANIM_PERIOD;

/** Le cycle entier, échantillonné comme l'afficheur le peint. */
function cycle(f: (anim: number) => number): { anim: number; v: number }[] {
  const out: { anim: number; v: number }[] = [];
  for (let i = 0; i * STEP < ANIM_PHASES; i++) {
    const anim = i * STEP;
    out.push({ anim, v: f(anim) });
  }
  return out;
}

test('le cycle du pictogramme est celui du battement de la rame', () => {
  assert.equal(DOOR_CYCLE, ANIM_PHASES * ANIM_PERIOD);
  // Et il BOUCLE : l'horloge d'animation tourne sans se remettre à zéro chez
  // tous ses lecteurs, et les phases négatives se replient comme les autres.
  for (const { anim, v } of cycle(doorAperture)) {
    assert.ok(Math.abs(doorAperture(anim + ANIM_PHASES) - v) < 1e-12, `tour suivant à ${anim}`);
    assert.ok(Math.abs(doorAperture(anim - ANIM_PHASES) - v) < 1e-12, `tour précédent à ${anim}`);
  }
});

test('les vantaux ne quittent jamais leur débattement', () => {
  for (const { anim, v } of cycle(doorAperture)) {
    assert.ok(v >= 0 && v <= 1, `hors bornes à ${anim} : ${v}`);
  }
  for (const { anim, v } of cycle(doorMarker)) {
    assert.ok(v >= 0 && v <= 1, `hors bornes à ${anim} : ${v}`);
  }
});

test('aucun pas ne fait un bond, pas même au raccord de la boucle', () => {
  // L'animation d'avant sautait d'un tiers puis des deux tiers du débattement
  // d'un battement à l'autre. On tient très en dessous - et surtout on le tient
  // AU RACCORD, en repartant du dernier pas du cycle vers le premier du
  // suivant, qui est l'endroit où une boucle se voit se recoller.
  const steps = cycle(doorAperture);
  for (let i = 1; i <= steps.length; i++) {
    const from = steps[i - 1];
    const to = steps[i % steps.length];
    const jump = Math.abs(to.v - from.v);
    assert.ok(jump < 0.15, `bond de ${jump} à la phase ${from.anim}`);
  }
});

test('l’ouverture part et s’arrête en douceur, et accélère entre les deux', () => {
  const steps = cycle(doorAperture);
  // Le geste d'ouverture : du premier pas qui décolle au premier qui touche le
  // bout. C'est le seul segment qu'on regarde ici.
  const moving = steps.filter((s) => s.v > 0 && s.v < 1 && s.anim < ANIM_PHASES / 2);
  assert.ok(moving.length >= 10, `ouverture trop courte pour être lisse : ${moving.length} images`);
  const deltas: number[] = [];
  for (let i = 1; i < moving.length; i++) deltas.push(moving[i].v - moving[i - 1].v);
  const peak = Math.max(...deltas);
  assert.ok(deltas[0] < peak / 2, `l’ouverture démarre à pleine vitesse : ${deltas[0]} / ${peak}`);
  assert.ok(
    deltas[deltas.length - 1] < peak / 2,
    `l’ouverture s’arrête à pleine vitesse : ${deltas[deltas.length - 1]} / ${peak}`,
  );
  // Et elle accélère : le débattement relevé (2 → 12 → 31 px) n'est pas
  // linéaire, la moitié du temps ne fait pas la moitié du chemin.
  const half = moving[Math.floor(moving.length / 2)].v;
  assert.ok(half < 0.5, `l’ouverture ne pousse pas avant de filer : ${half}`);
});

test('les vantaux montent, tiennent, redescendent - et rien d’autre', () => {
  const steps = cycle(doorAperture);
  let seenOpen = false;
  let seenShut = false;
  for (let i = 1; i < steps.length; i++) {
    const d = steps[i].v - steps[i - 1].v;
    if (d > 1e-9) {
      // Une remontée après la fermeture serait un second geste dans le même
      // cycle : le pictogramme n'ouvre qu'une fois par tour.
      assert.ok(!seenShut, `les vantaux repartent après s’être refermés (${steps[i].anim})`);
      seenOpen = true;
    }
    if (d < -1e-9) {
      assert.ok(seenOpen, `les vantaux se referment sans s’être ouverts (${steps[i].anim})`);
      seenShut = true;
    }
  }
  assert.ok(seenOpen && seenShut, 'le cycle ne fait pas l’aller-retour');
  // Il finit joint : sans ce temps mort, la boucle recommencerait sur une porte
  // encore entrouverte et le geste n'aurait plus de début.
  assert.equal(steps[steps.length - 1].v, 0);
});

test('le triangle ne sort que d’une porte arrêtée grande ouverte', () => {
  let out = 0;
  for (const { anim, v } of cycle(doorMarker)) {
    if (v <= 0) continue;
    out++;
    assert.equal(doorAperture(anim), 1, `triangle sorti d’une porte à ${doorAperture(anim)}`);
  }
  assert.ok(out >= 5, `le triangle ne fait que passer : ${out} images`);
});

test('le triangle sort et rentre sans sauter', () => {
  const steps = cycle(doorMarker);
  for (let i = 1; i <= steps.length; i++) {
    const jump = Math.abs(steps[i % steps.length].v - steps[i - 1].v);
    assert.ok(jump < 0.2, `bond de ${jump} à la phase ${steps[i - 1].anim}`);
  }
  assert.ok(
    steps.some((s) => s.v === 1),
    'le triangle ne sort jamais tout à fait',
  );
});

test('au battement, le triangle se lit comme avant : une phase sur quatre', () => {
  // C'est ce que voit le plan des correspondances, qui ne se repeint qu'aux
  // battements : la troisième phase, et elle seule. Toucher au calendrier du
  // triangle sans y penser lui rendrait un clignotement de travers.
  const lit = [0, 1, 2, 3].filter((phase) => doorMarker(phase) > 0);
  assert.deepEqual(lit, [2]);
  assert.equal(doorMarker(2), 1);
  // Aux mêmes battements, les vantaux se lisent joints puis grands ouverts.
  assert.equal(doorAperture(0), 0);
  assert.equal(doorAperture(2), 1);
});

test('un seul écran du cycle ne s’arrête jamais de bouger', () => {
  const base = {
    index: 0,
    clock: '10:00',
    countdown: 30,
    notice: null,
    emergencyReason: 0,
    animated: true,
  };
  const doors: LineScreenFrame = {
    ...base, state: 'stationLayout', mode: 'doors', status: 'soon', lang: 'jp',
  };
  const transfers: LineScreenFrame = {
    ...base, state: 'stationLayout', mode: 'transfers', status: 'next', lang: 'jp',
  };
  assert.equal(screenLoops(doors), true);
  // Le même plan avec les correspondances en bas n'a pas de pictogramme : le
  // garder éveillé serait repeindre deux mille lignes de canevas trente fois
  // par seconde pour un clignotant qui bat deux fois.
  assert.equal(screenLoops(transfers), false);
  for (const state of ['loopJP', 'zoomJP', 'transfers', 'priority', 'brake'] as const) {
    assert.equal(screenLoops({ ...base, state, status: 'next' }), false, state);
  }
});
