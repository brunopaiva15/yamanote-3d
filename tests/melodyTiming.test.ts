// La 発車メロディ sonne DEUX FOIS, entière, puis les portes se ferment.
//
// C'est la règle que ce fichier tient. Elle repose sur trois choses qui peuvent
// diverger en silence :
//
// 1. le manifeste des durées (src/data/melodyManifest.ts) et les MP3 réellement
//    posés sous public/audio/melodies - une regravure sans `node
//    scripts/melody-manifest-gen.mjs` taillerait la fenêtre sur des longueurs
//    périmées ;
// 2. le PLANIFICATEUR (`plannedDepartureMelodyPath`) et le sélecteur qui joue
//    vraiment (`playDepartureMelodyForContext`) : deux listes, deux ordres. On
//    ne les compare pas ligne à ligne - on vérifie que jamais deux prédicats ne
//    sont vrais sur un même quai, ce qui rend l'ordre indifférent ;
// systems/stationCycle, lui, n'est pas importable ici (il tire tout le moteur
// audio) : ce qu'il fait de cette fenêtre - la mélodie d'abord, l'annonce de
// fermeture ensuite, les portes en dernier - se lit dans « Chronologie de
// l'arrêt ».

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  EBISU_THIRD_MAN_F,
  EXCLUSIVE_MELODY_ORDER,
  IKEBUKURO_BIC_CAMERA_A,
  IKEBUKURO_BIC_CAMERA_B,
  MELODY_DURATIONS,
  SESERAGI_PLATFORMS,
  MELODY_PATHS,
  MELODY_REPEATS,
  MELODY_REPEAT_GAP_S,
  melodyRoundsDuration,
  plannedDepartureMelodyPath,
  plannedMelodySounding,
  shouldPlayInnerMainMelody,
  shouldPlayOuterMainMelody,
  type MelodyPlayContext,
} from '../src/data/melodies.ts';
import { STATIONS } from '../src/data/stations.ts';
import { platformFor, type LoopDirection } from '../src/data/platforms.ts';
import { mp3Duration } from '../scripts/mp3-duration.mjs';

const MELODY_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'public',
  'audio',
  'melodies',
);

const DIRECTIONS: LoopDirection[] = ['inner', 'outer'];

/** Quais desservis par la Yamanote, sens par sens : (gare, sens, voie). */
function platforms(): { jy: string; direction: LoopDirection; platform: number }[] {
  const out: { jy: string; direction: LoopDirection; platform: number }[] = [];
  for (const station of STATIONS) {
    for (const direction of DIRECTIONS) {
      const info = platformFor(station.jy, direction);
      if (!info) continue;
      out.push({ jy: station.jy, direction, platform: info.platform });
      if (info.alternativePlatform != null) {
        out.push({ jy: station.jy, direction, platform: info.alternativePlatform });
      }
    }
  }
  return out;
}

test('chaque clip de mélodie a sa durée au manifeste, et elle est juste', () => {
  const missing = MELODY_PATHS.filter((p) => !(p in MELODY_DURATIONS));
  assert.deepEqual(missing, [], 'mélodies sans durée - relancer melody-manifest-gen.mjs');

  const drifted: string[] = [];
  for (const [path, declared] of Object.entries(MELODY_DURATIONS)) {
    const file = join(MELODY_DIR, path.split('/').pop() as string);
    assert.ok(existsSync(file), `manifeste sans fichier : ${path}`);
    // 0,05 s de tolérance : le manifeste arrondit au centième.
    if (Math.abs(mp3Duration(file) - declared) > 0.05) drifted.push(path);
  }
  assert.deepEqual(drifted, [], 'durées périmées - relancer melody-manifest-gen.mjs');
});

test('la fenêtre sonore tient deux passages entiers, respiration comprise', () => {
  for (const path of MELODY_PATHS) {
    const one = MELODY_DURATIONS[path];
    assert.equal(
      melodyRoundsDuration(path),
      MELODY_REPEATS * one + (MELODY_REPEATS - 1) * MELODY_REPEAT_GAP_S,
      path,
    );
  }
});

test('deux mélodies ne se disputent jamais le même quai', () => {
  // C'est ce qui autorise le planificateur à parcourir sa propre liste : l'ordre
  // n'a plus d'importance dès lors qu'au plus un prédicat répond.
  for (const { jy, direction, platform } of platforms()) {
    const ctx: MelodyPlayContext = {
      line: 'yamanote',
      direction,
      stationCode: jy,
      platform,
      trainState: 'stopped_doors_open',
      departureSequenceStarted: true,
      serviceState: 'in_service',
      serviceType: 'normal',
      emergencyActive: false,
      departureAuthorized: true,
    };
    const matches = [
      ...EXCLUSIVE_MELODY_ORDER.filter((m) => m.test(ctx)).map((m) => m.path),
      ...(shouldPlayInnerMainMelody(ctx) ? ['inner-main'] : []),
      ...(shouldPlayOuterMainMelody(ctx) ? ['outer-main'] : []),
    ];
    assert.ok(matches.length <= 1, `${jy} ${direction} voie ${platform} : ${matches.join(', ')}`);
  }
});

test('Seseragi est câblée sur des voies qui existent, et dans le bon sens', () => {
  // Le prédicat compare le numéro de voie ; une voie fausse ne se voit nulle
  // part ailleurs, puisqu'elle rend le quai muet au lieu de le faire râler.
  for (const [jy, config] of Object.entries(SESERAGI_PLATFORMS)) {
    const info = platformFor(jy, config.direction);
    assert.ok(info, `${jy} : sens ${config.direction} inconnu de data/platforms`);
    assert.equal(
      config.platform,
      info.platform,
      `${jy} ${config.direction} : Seseragi voie ${config.platform}, quai réel voie ${info.platform}`,
    );
    assert.equal(config.nextStation, info.nextStation, `${jy} : gare suivante`);
  }
});

test('les mélodies à deux quais visent des voies qui existent dans ce sens', () => {
  // Même piège que Seseragi, en double : Ebisu et Ikebukuro déclarent une voie
  // PAR SENS, et une seule des deux peut être fausse sans que rien ne le dise.
  // Les voies alternatives d'Ikebukuro (5 et 8) comptent autant que les
  // principales - la table de JR East dit 全番線.
  for (const config of [EBISU_THIRD_MAN_F, IKEBUKURO_BIC_CAMERA_A, IKEBUKURO_BIC_CAMERA_B]) {
    for (const direction of DIRECTIONS) {
      const slot = config.byDirection[direction];
      const info = platformFor(config.stationCode, direction);
      assert.ok(info, `${config.stationCode} ${direction}`);
      const known = [info.platform, ...(info.alternativePlatform ? [info.alternativePlatform] : [])];
      assert.ok(
        known.includes(slot.platform),
        `${config.stationCode} ${direction} : voie ${slot.platform}, quais réels ${known.join(' et ')}`,
      );
      assert.equal(slot.nextStationName, info.nextStation, `${config.stationCode} ${direction}`);
    }
  }
});

test('les quais sans clip sont ceux qu’on sait, et leur fenêtre reste pleine', () => {
  // Il ne reste que trois quais sans clip, et c'est le même trou : 巣鴨, 大塚 et
  // 目白 en 内回り diffusent 「春」, qui n'est pas gravé - seule la version trémolo
  // de 鶯谷 l'est. Tous les autres quais de la boucle ont leur mélodie.
  //
  // Ce qui a quitté la liste, et pourquoi :
  //   • JY11 outer - c'est Seseragi, mais la table la donnait voie 2, le quai
  //     内回り de Sugamo ; le prédicat ne trouvait jamais son quai ;
  //   • JY13 outer 7 et 8 - 「ビックカメラテーマソング（全番線バージョン違い）」 : les
  //     quatre voies la diffusent, pas seulement les deux du 内回り ;
  //   • JY21 outer - 第三の男 sonne des deux côtés du quai d'Ebisu.
  //
  // La liste est figée ici pour qu'un branchement ajouté - ou perdu - se voie.
  const silent = platforms().filter(
    ({ jy, direction, platform }) => plannedDepartureMelodyPath(jy, direction, platform) === null,
  );
  assert.deepEqual(silent.map((p) => `${p.jy} ${p.direction} voie ${p.platform}`), [
    'JY11 inner voie 2',
    'JY12 inner voie 1',
    'JY14 inner voie 1',
  ]);

  // Clip ou synthèse, la fenêtre réservée vaut toujours deux passages entiers :
  // aucun quai ne se retrouve avec une mélodie coupée en deux.
  for (const { jy, direction, platform } of platforms()) {
    assert.ok(
      plannedMelodySounding(jy, direction, platform) >=
        melodyRoundsDuration(plannedDepartureMelodyPath(jy, direction, platform)),
      `${jy} ${direction} voie ${platform}`,
    );
    assert.ok(plannedMelodySounding(jy, direction, platform) >= 13.5, `${jy} ${direction}`);
  }
});
