// La machine à états de l'afficheur de bord (three/lineScreenCycle) et les
// trois confusions qu'elle a portées.
//
// Ce test lit les SOURCES plutôt que d'exécuter la rotation, et ce n'est pas
// par facilité : `lineScreenCycle` tient à `store`, donc à zustand et au
// document, et le harnais de `node --test` n'a ni l'un ni l'autre. Ce qu'on
// protège ici n'est de toute façon pas un calcul mais une DISTINCTION - trois
// endroits où deux choses différentes portaient le même nom, et où rien dans le
// typage n'empêche de les recoller :
//
//  1. la LANGUE du cycle et le CONTENU du plan des sorties. Le code peignait le
//     côté d'ouverture des portes sur le passage japonais et les
//     correspondances sur le passage anglais : un anglophone n'apprenait jamais
//     par quelle paroi descendre, et un japonophone voyait le côté d'ouverture
//     annoncé dix stations trop tôt ;
//  2. la GRAPHIE du nom de gare. Le bandeau écrivait 「つぎは」「かんだ」 en
//     hiragana là où l'E235 écrit 「次は」「神田」 ;
//  3. les avis de CAMPAGNE et la rotation de trajet. Vigilance renforcée,
//     places prioritaires et mode silencieux passaient entre chaque paire de
//     gares, trente fois par tour.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string): string => readFileSync(resolvePath(ROOT, rel), 'utf8');

const CYCLE = 'src/three/lineScreenCycle.ts';
const PAINT = 'src/three/lineScreen.ts';
const PROBE = 'lcd-probe.html';

test('aucun état ne mélange la langue et le contenu du plan des sorties', () => {
  const cycle = read(CYCLE);
  const paint = read(PAINT);
  // `approachJP` / `approachEN` disaient « plan du quai, version japonaise » et
  // « plan du quai, version anglaise » alors qu'ils portaient DEUX CONTENUS
  // différents. Le nom est parti avec la confusion.
  for (const dead of ['approachJP', 'approachEN', 'drawApproach']) {
    for (const [file, source] of [[CYCLE, cycle], [PAINT, paint], [PROBE, read(PROBE)]] as const) {
      assert.ok(!source.includes(dead), `${file} référence encore ${dead}`);
    }
  }
  // Les deux états sémantiques, eux, existent des deux côtés.
  for (const state of ['exitTransfers', 'exitDoors']) {
    assert.ok(cycle.includes(`'${state}'`), `la rotation ne connaît pas ${state}`);
  }
  for (const fn of ['drawExitTransfers', 'drawExitDoors']) {
    assert.match(paint, new RegExp(`export function ${fn}\\(`), `${fn} n’est pas peint`);
  }
  // Et aucun des deux ne prend de langue : leur composition est fixe, c'est le
  // moment du trajet qui les sépare.
  for (const fn of ['drawExitTransfers', 'drawExitDoors']) {
    const signature = paint.slice(paint.indexOf(`export function ${fn}(`));
    const params = signature.slice(0, signature.indexOf('): void'));
    assert.ok(!params.includes('lang'), `${fn} choisit encore son contenu par la langue`);
  }
});

test('le plan des portes est celui de l’approche, celui des correspondances celui de la marche', () => {
  const cycle = read(CYCLE);
  // Phase `brake` : le côté d'ouverture, et lui seul. Plus d'alternance avec le
  // plan des correspondances.
  const brake = cycle.slice(cycle.indexOf("phase === 'brake'"), cycle.indexOf("phase === 'dwell'"));
  assert.ok(brake.includes("state = 'exitDoors'"), 'l’approche immédiate ne montre pas le côté d’ouverture');
  assert.ok(!brake.includes('exitTransfers'), 'l’approche immédiate alterne encore avec les correspondances');
  assert.ok(brake.includes("status = 'soon'"), 'l’approche immédiate ne dit pas まもなく');

  // Phase `dwell` : à quai, plus de まもなく, et pas d'écran forcé en fin
  // d'arrêt pour remplacer le pictogramme de fermeture des portes.
  const dwell = cycle.slice(cycle.indexOf("phase === 'dwell'"), cycle.indexOf('} else {'));
  assert.ok(dwell.includes("status = 'now'"), 'la rame arrêtée ne dit pas ただいま');
  assert.ok(!dwell.includes("'soon'"), 'まもなく reste affiché à quai');
  assert.ok(!dwell.includes('exitDoors'), 'le côté d’ouverture est annoncé portes déjà ouvertes');
  assert.ok(
    !dwell.includes('CLOSE_ANNOUNCE_LEAD'),
    'un écran est encore forcé en fin de stationnement',
  );

  // Le plan des sorties « portes » est le SEUL à dépendre de la paroi regardée.
  assert.match(
    cycle,
    /f\.state === 'exitDoors' \?/,
    'la paroi regardée entre dans la clé d’états qui n’en dépendent pas',
  );
});

test('le bandeau japonais écrit les trois états et les gares en kanji', () => {
  const paint = read(PAINT);
  assert.match(paint, /next: \{ jp: '次は'/, 'le bandeau écrit encore つぎは');
  assert.match(paint, /now: \{ jp: 'ただいま'/, 'le libellé ただいま a bougé');
  assert.match(paint, /soon: \{ jp: 'まもなく'/, 'le libellé まもなく a bougé');
  // Le commentaire du bandeau cite la mauvaise graphie pour dire qu'elle est
  // mauvaise : c'est le LITTÉRAL qu'on traque, pas le mot.
  assert.ok(!paint.includes("'つぎは'"), 'つぎは est encore peint quelque part');
  // La lecture hiragana ne remplace plus le nom de la gare sur la dalle - mais
  // elle reste dans les données, où la signalétique de quai et la synthèse
  // vocale la lisent.
  const stationName = paint.slice(paint.indexOf('function stationName('));
  assert.ok(
    !stationName.slice(0, stationName.indexOf('\n}')).includes('st.kana'),
    'le nom de gare du LCD repasse par la lecture kana',
  );
  assert.match(read('src/data/stations.ts'), /kana: 'かんだ'/, 'les lectures kana ont disparu des données');
  assert.match(read('src/textures/procedural.ts'), /st\.kana/, 'la signalétique de quai a perdu la lecture kana');
});

test('les avis de campagne appartiennent à un intervalle, pas à la rotation', () => {
  const cycle = read(CYCLE);
  // La rotation de croisière ne les cite plus en dur : elle déplie la table des
  // secteurs, qui rend le plus souvent une liste vide.
  const rotation = cycle.slice(cycle.indexOf('const rotation: LineScreenState[]'), cycle.indexOf('if (notice) rotation.push'));
  for (const notice of ['securityJP', 'securityEN', 'priority', 'manner']) {
    assert.ok(!rotation.includes(notice), `${notice} passe encore entre toutes les gares`);
  }
  assert.match(rotation, /segmentNotices\(index, dir\)/, 'la rotation ne consulte pas le secteur');
  // La clé d'intervalle est triée, donc identique dans les deux sens : il n'y a
  // pas de manière d'inscrire un avis dans un seul sens par distraction.
  assert.match(
    cycle,
    /return fromJy < toJy \? `\$\{fromJy\}-\$\{toJy\}` : `\$\{toJy\}-\$\{fromJy\}`/,
    'la clé d’intervalle dépend du sens de circulation',
  );
  // Et rien de tout cela n'est tiré au sort : deux battements sur le même
  // intervalle doivent donner la même liste.
  const table = cycle.slice(cycle.indexOf('const NOTICE_SECTORS'), cycle.indexOf('export function segmentNotices'));
  assert.ok(!table.includes('Math.random'), 'les avis de secteur sont tirés au sort');
  assert.ok(!table.includes('rng('), 'les avis de secteur sont tirés au sort');
});

test('l’incident passe avant la rotation, quelle que soit la phase', () => {
  const cycle = read(CYCLE);
  const body = cycle.slice(cycle.indexOf('export function lineScreenFrame'));
  const emergency = body.indexOf("emergency.stage !== 'none'");
  const brake = body.indexOf("phase === 'brake'");
  const dwell = body.indexOf("phase === 'dwell'");
  assert.ok(emergency > 0, 'la rotation ne consulte plus l’arrêt d’urgence');
  assert.ok(
    emergency < brake && emergency < dwell,
    'une phase du trajet est examinée avant l’arrêt d’urgence',
  );
});
