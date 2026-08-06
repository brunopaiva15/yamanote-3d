// Ce qui dépasse de l'horizon, et ce qui reste derrière.
//
// C'est le genre de chose qu'aucune capture ne tranche : il s'agit de fractions
// de degré, et l'erreur qu'on veut attraper - oublier la courbure de la Terre -
// donne une image parfaitement plausible, avec une ligne de collines tout
// autour de Tokyo. Elle est fausse, et seul le calcul le dit.
//
// Les faits de contrôle sont vérifiables ailleurs : le mont Ōyama (1 171 m, à
// quarante-neuf kilomètres) se voit d'un quai de la Yamanote par temps clair,
// les collines de Tama et de Miura ne se voient de nulle part, et l'est de la
// ville n'a pas de relief du tout - la baie, puis la plaine de Chiba.

import test from 'node:test';
import assert from 'node:assert/strict';
import { RELIEF_SUMMITS, type ReliefSummit } from '../src/data/relief.ts';
import {
  apparentDrop,
  buildProfile,
  elevationAt,
  horizonDip,
  makeProfile,
} from '../src/three/city/reliefProfile.ts';

/** Le point d'arrêt de Tokyo est l'origine du repère. */
const EYE = { x: 0, z: 0 };
/** Un œil de voyageur : la plaine à trois mètres, le viaduc, le regard. */
const EYE_ALT = 12;

function find(name: string): ReliefSummit {
  const su = RELIEF_SUMMITS.find((s) => s.name === name);
  assert.ok(su, `sommet ${name} dans le relevé`);
  return su;
}

function distance(su: ReliefSummit): number {
  return Math.hypot(su.x - EYE.x, su.z - EYE.z);
}

/** Hauteur apparente du sommet au-dessus de l'horizon, en degrés. */
function apex(su: ReliefSummit, eyeAlt = EYE_ALT): number {
  return (elevationAt(su, distance(su), 0, eyeAlt) * 180) / Math.PI;
}

test('la Terre est ronde, et c’est le fait qui décide de tout', () => {
  // Trente kilomètres de plaine cachent soixante mètres, cinquante en cachent
  // cent soixante-dix : c'est pour cela qu'on ne voit pas les collines de Tama
  // depuis Tokyo, alors qu'elles sont deux fois plus hautes qu'une tour.
  assert.ok(Math.abs(apparentDrop(30000) - 61) < 3, `30 km : ${apparentDrop(30000).toFixed(0)} m`);
  assert.ok(Math.abs(apparentDrop(50000) - 171) < 6, `50 km : ${apparentDrop(50000).toFixed(0)} m`);
  // Sans réfraction, l'abaissement serait de 15 % plus fort. L'écart est de
  // vingt-cinq mètres à cinquante kilomètres, soit la moitié d'une colline.
  assert.ok(apparentDrop(50000) < (50000 * 50000) / (2 * 6371000));
});

test('l’horizon descend quand on monte', () => {
  // Deux dixièmes de degré depuis un viaduc, et c'est l'ordre de grandeur de ce
  // que dépassent les crêtes : compter leur hauteur depuis l'horizontale plutôt
  // que depuis l'horizon changerait le résultat du tout au tout.
  assert.ok(Math.abs((horizonDip(40) * 180) / Math.PI - 0.19) < 0.02);
  assert.equal(horizonDip(0), 0);
  assert.ok(horizonDip(40) > horizonDip(10), 'plus haut, plus bas');
});

test('le relief de l’ouest dépasse, celui de la baie non', () => {
  // Ce qu'on voit vraiment de la Yamanote un matin d'hiver : la barre du
  // Tanzawa et de l'Okutama, à cinquante kilomètres à l'ouest.
  for (const name of ['大山', '蛭ヶ岳', '雲取山', '大岳山']) {
    const a = apex(find(name));
    assert.ok(a > 0.5, `${name} barre l’horizon (${a.toFixed(2)}°)`);
  }
  // Et ce qu'on n'en voit presque pas : les collines de Miura et de Bōsō, de
  // l'autre côté de la baie. Deux à trois cents mètres à cinquante
  // kilomètres, c'est-à-dire un liséré qui affleure - jamais une montagne.
  for (const name of ['大楠山', '鋸山', '嵯峨山', '大丸山', '高宕山']) {
    const a = apex(find(name));
    assert.ok(a < 0.2, `${name} affleure à peine (${a.toFixed(3)}°)`);
  }
  // Le Tsukuba est l'exception de l'est, et c'est bien pour cela qu'il est
  // célèbre : sept cent quatre-vingt-cinq mètres seuls au milieu de la plaine
  // du Kantō, à soixante-sept kilomètres au nord-nord-est.
  assert.ok(apex(find('筑波山')) > 0.35, 'le Tsukuba se voit de Tokyo');
});

test('le voyageur sur viaduc voit plus loin que celui au ras du sol', () => {
  // Monter fait deux choses en sens contraire : ça abaisse tout d'un poil par
  // rapport à l'horizontale, et ça abaisse l'horizon de bien davantage. Le
  // solde est celui du bon sens, et il ne l'était pas quand on comptait depuis
  // l'horizontale : sept mètres et demi de tablier font sortir des crêtes.
  const seen = (e: number) => RELIEF_SUMMITS.filter((su) => apex(su, e) > 0).length;
  assert.ok(seen(45) > seen(4), `${seen(4)} crêtes au sol, ${seen(45)} sur viaduc`);
  for (const su of RELIEF_SUMMITS) {
    assert.ok(apex(su, 45) >= apex(su, 4) - 1e-9, 'monter ne cache jamais rien');
  }
});

test('la demi-largeur fait ce qu’elle promet', () => {
  const su = find('大山');
  const d = distance(su);
  // Par définition : à la demi-largeur, la moitié de la dénivelée est perdue.
  const flank = elevationAt(su, d, su.halfWidth, 0) * d;
  const top = elevationAt(su, d, 0, 0) * d;
  assert.ok(Math.abs(top - flank - su.relief / 2) < 1, 'mi-dénivelée à la demi-largeur');
  // Et le dôme ne remonte jamais en s'éloignant de son axe.
  let prev = top;
  for (let y = 0; y < 20000; y += 250) {
    const h = elevationAt(su, d, y, 0) * d;
    assert.ok(h <= prev + 1e-9, 'un dôme ne remonte pas');
    prev = h;
  }
});

test('le tour d’horizon depuis Tokyo : l’ouest barré, l’est ouvert', () => {
  const bins = 360;
  const prof = makeProfile(bins);
  buildProfile(prof, RELIEF_SUMMITS, EYE.x, EYE.z, EYE_ALT, 200000);
  const at = (d: number) => (prof.elev[((d % 360) + 360) % 360] * 180) / Math.PI;

  // L'ouest et le nord-ouest : le Tanzawa, l'Okutama, le Chichibu. Une ligne
  // CONTINUE, pas des pics isolés - c'est le maximum des dômes qui la fait, et
  // c'est la différence entre une chaîne de montagnes et une rangée de dents.
  let barred = 0;
  for (let a = 250; a <= 320; a++) if (at(a) > 0.1) barred++;
  assert.ok(barred > 60, `l’arc ouest est barré sur ${barred}° de 71`);

  // L'est : la baie, puis le Pacifique, puis la plaine de Chiba. Rien qui
  // atteigne le dixième de degré sur quatre-vingt-dix degrés de tour.
  for (let a = 45; a <= 135; a++) assert.ok(at(a) < 0.1, `${at(a).toFixed(2)}° au ${a}°`);
  // Au sud-est, de l'autre côté de la baie, les collines de Bōsō : quelque
  // chose, mais rien qui se compare à l'ouest.
  let bo = 0;
  for (let a = 140; a <= 175; a++) bo = Math.max(bo, at(a));
  assert.ok(bo > 0.1 && bo < 0.4, `le Bōsō affleure à ${bo.toFixed(2)}°`);

  // Le point culminant du tour d'horizon est le Fuji, à l'ouest-sud-ouest.
  let best = 0;
  let bestAz = -1;
  for (let i = 0; i < bins; i++) {
    if (prof.elev[i] > best) {
      best = prof.elev[i];
      bestAz = i;
    }
  }
  assert.ok(bestAz >= 240 && bestAz <= 260, `le point culminant est au ${bestAz}°`);
  const fuji = find('富士山');
  const top = (best * 180) / Math.PI;
  // Le secteur ne tombe jamais pile sur le sommet - un degré de tour vaut
  // presque un kilomètre à cette distance -, donc il en manque toujours un peu.
  assert.ok(top <= apex(fuji) + 1e-9 && top > apex(fuji) - 0.15, 'et c’est bien lui');
  // Deux degrés : trois mille sept cents mètres à cent kilomètres, moins les
  // sept cents que la courbure de la Terre en enterre.
  assert.ok(Math.abs(apex(fuji) - 2.0) < 0.3, `${apex(fuji).toFixed(2)}°`);
  assert.ok(apparentDrop(distance(fuji)) > 650, 'la courbure en mange le pied');

  // Le secteur d'une crête porte la distance de ce qui la tient : c'est ce qui
  // décide de son voile de brume, et il serait faux de le prendre sur le fond.
  for (let i = 0; i < bins; i++) {
    if (prof.elev[i] > 0) assert.ok(prof.dist[i] > 20000 && prof.dist[i] < 130000);
    else assert.equal(prof.dist[i], Infinity);
  }
});

test('le profil se recalcule depuis l’œil, il n’est pas lu dans une table', () => {
  const bins = 360;
  const here = makeProfile(bins);
  const west = makeProfile(bins);
  buildProfile(here, RELIEF_SUMMITS, 0, 0, EYE_ALT, 200000);
  // Trente kilomètres plein ouest : les mêmes montagnes, mais plus près, donc
  // plus hautes et plus larges.
  buildProfile(west, RELIEF_SUMMITS, -30000, 0, EYE_ALT, 200000);
  const sum = (p: Float32Array) => p.reduce((a, b) => a + b, 0);
  assert.ok(sum(west.elev) > sum(here.elev) * 1.5, 'l’ouest grandit en s’en approchant');

  // Et la portée de l'air le coupe : sous l'averse, il ne reste rien.
  const blind = makeProfile(bins);
  buildProfile(blind, RELIEF_SUMMITS, 0, 0, EYE_ALT, 3000);
  assert.equal(sum(blind.elev), 0, 'sous la pluie, plus de montagnes');
});

test('le relevé lui-même tient debout', () => {
  assert.ok(RELIEF_SUMMITS.length > 100, 'le relevé couvre le tour d’horizon');
  let prev = Infinity;
  for (const su of RELIEF_SUMMITS) {
    assert.ok(Number.isFinite(su.x) && Number.isFinite(su.z), 'position finie');
    assert.ok(su.altitude > 0 && su.altitude < 4000, `altitude plausible : ${su.altitude}`);
    assert.ok(su.relief > 0 && su.relief <= su.altitude, 'dénivelée dans son altitude');
    assert.ok(su.halfWidth > 100 && su.halfWidth < 20000, `demi-largeur : ${su.halfWidth}`);
    assert.ok(Math.hypot(su.x, su.z) < 120000, 'dans le rayon relevé');
    assert.ok(su.relief <= prev, 'du plus marquant au plus modeste');
    prev = su.relief;
    // Règle 11 : ce qui n'a pas de nom dans OSM n'en reçoit pas.
    assert.ok(su.name === null || su.name.length > 0, 'un nom, ou rien');
  }
});
