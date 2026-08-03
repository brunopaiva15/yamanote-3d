// Les invariants d'architecture du multijoueur, tenus par lecture du source.
//
// Ce fichier ne vérifie aucun comportement : il vérifie des PROPRIÉTÉS DU CODE
// que ni TypeScript ni oxlint ne savent voir, et qui se perdent toutes seules
// au fil des mois.
//
// Le dépôt connaît déjà ce procédé - `tests/audioVersion.test.ts` interdit de
// la même façon que la version sonore n'atteigne three.js -, et il est ici
// d'autant plus justifié que les modules concernés sont censés être PURS :
// c'est leur pureté qui permet de les tester sous `node --test`, et le jour où
// l'un d'eux importera le store « juste pour une ligne », il cessera d'être
// testable sans que rien ne s'en aperçoive. À ce moment-là, on supprimera le
// test plutôt que l'import - c'est toujours comme ça que ça se passe. Autant
// que le test parle clairement pendant qu'il en est encore temps.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');
const NET_DIR = resolvePath(ROOT, 'src/systems/net');

function read(rel: string): string {
  return readFileSync(resolvePath(ROOT, rel), 'utf8');
}

/**
 * Les modules importés à l'EXÉCUTION, imports de type exclus.
 *
 * `import type { X } from './y'` est effacé à la compilation et ne crée aucune
 * arête réelle dans le bundle : le compter ferait échouer ces tests sur des
 * liens qui n'existent pas. C'est très exactement le cas de `net/protocol`, qui
 * n'emprunte au store que la FORME du type `Phase`.
 *
 * Même lecture que `tests/audioVersion.test.ts`, et pour la même raison.
 */
function runtimeImports(rel: string): string[] {
  const source = read(rel);
  const out: string[] = [];
  const withFrom = /(?:^|\n)\s*(?:import|export)(\s+type)?\s*([\s\S]*?)\s*from\s*['"]([^'"]+)['"]/g;
  for (const m of source.matchAll(withFrom)) {
    if (m[1]) continue;
    out.push(m[3]);
  }
  const bare = /(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g;
  for (const m of source.matchAll(bare)) out.push(m[1]);
  return out;
}

/**
 * Les modules du salon qui doivent rester PURS.
 *
 * « Pur » veut dire ici : aucune dépendance vers l'état du jeu, vers le moteur
 * de rendu, ni vers le réseau. Ils peuvent muter ce qu'on leur passe - le seau
 * à jetons le fait - mais ils ne connaissent personne et ne retiennent rien.
 */
const MODULES_PURS = [
  'src/systems/net/protocol.ts',
  'src/systems/net/roomCode.ts',
  'src/systems/net/hostElection.ts',
  'src/systems/net/poseBuffer.ts',
  'src/systems/net/reconcile.ts',
  'src/systems/net/chatLimiter.ts',
  // L'oracle a un état de module - le rôle, les tirages de l'arrêt courant -
  // mais aucune dépendance vers le jeu, et c'est ce qui compte ici : il doit
  // rester chargeable seul. Le jour où il importera `runtime` « juste pour lire
  // stopSequence », il faudra le lui passer en paramètre.
  'src/systems/net/worldDecisions.ts',
];

/**
 * Les modules qui doivent rester CHARGEABLES sous `node --test`, sans être purs
 * pour autant.
 *
 * `worldSample` lit le runtime et le store : il n'a rien d'un module pur. Mais
 * il porte toutes les conversions d'unités du protocole - secondes en
 * millisecondes, mètres en centimètres -, et une erreur là-dedans donnerait une
 * resynchronisation dure à chaque paquet, donc un carillon toutes les demi-
 * secondes. C'est exactement le genre d'erreur qu'on ne voit qu'à deux, tard,
 * et qu'on attribue d'abord au réseau. Il doit donc se tester, et pour ça il ne
 * doit surtout pas se mettre à importer `stationCycle` - qui tire derrière lui
 * le moteur audio et, en bout de chaîne, `import.meta.env`.
 */
const MODULES_CHARGEABLES = ['src/systems/net/worldSample.ts'];

/** Ce qu'un module chargeable-sans-navigateur ne doit pas atteindre. */
const LOURDS: { motif: RegExp; raison: string }[] = [
  { motif: /(^|\/)stationCycle$/, raison: 'le cycle station, et le moteur audio avec lui' },
  { motif: /(^|\/)audioEngine$/, raison: 'le moteur audio' },
  { motif: /(^|\/)platformWait$/, raison: 'la machine à états du quai' },
  { motif: /^three(\/|$)/, raison: 'le moteur de rendu' },
];

test('l’échantillonnage du monde reste testable sans navigateur', () => {
  const fautes: string[] = [];
  for (const file of MODULES_CHARGEABLES) {
    assert.ok(existsSync(resolvePath(ROOT, file)), `${file} a disparu`);
    for (const spec of runtimeImports(file)) {
      for (const { motif, raison } of LOURDS) {
        if (motif.test(spec)) fautes.push(`${file} importe ${spec} (${raison})`);
      }
    }
  }
  assert.deepEqual(
    fautes,
    [],
    'Ces modules portent les conversions d’unités du protocole et doivent ' +
      'pouvoir se charger sous `node --test`. Un seul de ces imports les rend ' +
      `intestables.\n${fautes.join('\n')}`,
  );
});

/** Ce qu'un module pur n'a pas le droit d'atteindre, et pourquoi. */
const INTERDITS: { motif: RegExp; raison: string }[] = [
  { motif: /^three(\/|$)/, raison: 'le moteur de rendu' },
  { motif: /^@react-three/, raison: 'react-three-fiber' },
  { motif: /^react(-dom)?(\/|$)/, raison: 'React' },
  { motif: /^zustand(\/|$)/, raison: 'zustand' },
  { motif: /^@supabase/, raison: 'le client réseau' },
  { motif: /(^|\/)store$/, raison: "l'état global du jeu" },
  { motif: /(^|\/)runtime$/, raison: 'le runtime muté à chaque image' },
  { motif: /(^|\/)audioEngine$/, raison: 'le moteur audio' },
];

test('les modules purs du salon le restent', () => {
  const fautes: string[] = [];
  for (const file of MODULES_PURS) {
    assert.ok(existsSync(resolvePath(ROOT, file)), `${file} a disparu`);
    for (const spec of runtimeImports(file)) {
      for (const { motif, raison } of INTERDITS) {
        if (motif.test(spec)) {
          fautes.push(`${file} importe ${spec} (${raison})`);
        }
      }
    }
  }
  assert.deepEqual(
    fautes,
    [],
    'Ces modules doivent pouvoir se charger sous `node --test`, sans navigateur ' +
      'ni moteur de rendu. Un seul de ces imports suffit à les rendre ' +
      "intestables, et le test qui s'en apercevra sera supprimé plutôt que " +
      `l'import.\n${fautes.join('\n')}`,
  );
});

test('aucun module du salon n’atteint le moteur de rendu', () => {
  // Les modules IMPURS (room, session, worldSync…) ont parfaitement le droit de
  // toucher au store et au runtime : c'est leur métier. Ils n'ont en revanche
  // aucune raison de connaître three.js - le rendu des avatars vit dans
  // `src/three`, et le passage de l'un à l'autre se fait par un tableau mutable,
  // comme `paxList`. Sans cette garde, la version SONORE se mettrait à
  // télécharger le moteur de rendu le jour où l'on jouera à plusieurs en audio.
  const fautes: string[] = [];
  if (!existsSync(NET_DIR)) return;
  for (const nom of readdirSync(NET_DIR)) {
    if (!nom.endsWith('.ts')) continue;
    const file = `src/systems/net/${nom}`;
    for (const spec of runtimeImports(file)) {
      if (spec === 'three' || spec.startsWith('three/') || spec.startsWith('@react-three')) {
        fautes.push(`${file} importe ${spec}`);
      }
    }
  }
  assert.deepEqual(fautes, [], fautes.join('\n'));
});

test('le protocole ne connaît le store que par ses types', () => {
  // `Phase` et `LoopDirection` sont la vérité du jeu : les recopier dans le
  // protocole ferait deux sources pour une même énumération, et le jour où une
  // phase s'ajouterait, le fil continuerait de n'en connaître que quatre.
  // L'import de TYPE donne la vérité sans la dépendance.
  const source = read('src/systems/net/protocol.ts');
  assert.match(source, /import type \{[^}]*Phase[^}]*\} from '\.\.\/\.\.\/store'/);
  assert.match(source, /import type \{[^}]*LoopDirection[^}]*\}/);
});

test('la version du protocole est un entier, et il n’y en a qu’une', () => {
  const source = read('src/systems/net/protocol.ts');
  const m = source.match(/export const PROTOCOL_VERSION = (\d+)/);
  assert.ok(m, 'PROTOCOL_VERSION a disparu ou changé de forme');
  assert.ok(Number.isInteger(Number(m[1])));
  assert.equal(
    (source.match(/PROTOCOL_VERSION =/g) ?? []).length,
    1,
    'deux déclarations de version : le fil ne saurait plus laquelle croire',
  );
});

test('tout message reçu passe par un validateur avant d’être cru', () => {
  // Le rendu lit ces nombres sans les regarder : un `NaN` qui passe la porte
  // devient une matrice de transformation `NaN`, donc une géométrie que three.js
  // élimine sans un mot - et l'avatar disparaît. Ce défaut-là ne se trouve pas
  // en jouant. Les validateurs sont la seule barrière ; qu'ils existent tous.
  const source = read('src/systems/net/protocol.ts');
  for (const nom of [
    'validPose',
    'validTick',
    'validStop',
    'validEvent',
    'validChat',
    'validPresence',
  ]) {
    assert.match(source, new RegExp(`export function ${nom}\\(`), `${nom} manque`);
  }
});

/**
 * Les `Math.random()` qu'on tolère encore dans le cycle station, et pourquoi.
 *
 * Chaque entrée nomme une fonction et dit ce qu'elle tire. Ajouter un tirage au
 * cycle sans le faire passer par l'oracle rendra ce test rouge, et c'est tout
 * son objet : un seul `Math.random()` égaré dans `randomizeStopTimings` ferait
 * s'arrêter les rames de deux joueurs à des endroits différents, sans qu'aucune
 * erreur n'apparaisse nulle part. C'est le défaut le plus coûteux à trouver de
 * tout le multijoueur, et le moins cher à empêcher.
 */
const RANDOM_TOLERES: { fonction: string; raison: string; combien: number }[] = [
  {
    fonction: 'scheduleNextRunSound',
    raison: 'bruit de roulement : ni vu ni nommé, il n’appartient à personne',
    combien: 1,
  },
  {
    fonction: 'scheduleBatteryTick',
    raison: 'tic du relais de secours : local, comme le bruit de roulement',
    combien: 1,
  },
  {
    fonction: 'randomizeEntry',
    raison: 'point d’entrée sur la boucle : un suiveur ne l’appelle jamais, ' +
      'il entre par l’instantané de l’hôte',
    combien: 5,
  },
  {
    fonction: 'updateCycle',
    raison: 'crissement de boudin en courbe : local (voir scheduleNextRunSound)',
    combien: 2,
  },
];

/**
 * Le source, débarrassé de ses commentaires.
 *
 * Indispensable ici : ce dépôt EXPLIQUE ses choix, et les commentaires qui
 * justifient les tirages restants nomment forcément `Math.random()`. Les
 * compter ferait échouer le test sur sa propre documentation - et la façon la
 * plus rapide de le faire repasser au vert serait alors d'effacer l'explication,
 * ce qui est exactement l'inverse du but recherché.
 */
function code(rel: string): string {
  return read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

test('le cycle station ne tire plus rien hors de l’oracle', () => {
  const source = code('src/systems/stationCycle.ts');
  const total = (source.match(/Math\.random\(\)/g) ?? []).length;
  const attendu = RANDOM_TOLERES.reduce((n, t) => n + t.combien, 0);
  assert.equal(
    total,
    attendu,
    `${total} appels à Math.random() dans stationCycle, ${attendu} attendus.\n` +
      'Les seuls tolérés sont :\n' +
      RANDOM_TOLERES.map((t) => `  · ${t.fonction} (×${t.combien}) — ${t.raison}`).join('\n') +
      '\nTout nouveau tirage doit passer par systems/net/worldDecisions, sinon ' +
      'deux joueurs du même salon ne vivront pas le même arrêt - et rien ne le dira.',
  );
});

test('les portes se tirent par une graine injectée, pas à l’import du module', () => {
  const source = read('src/systems/doorMotion.ts');
  assert.match(
    source,
    /export function randomizeDoorTimings\(random: \(\) => number = Math\.random\)/,
    'le générateur doit rester injectable, avec Math.random par défaut',
  );
  // Un appel de niveau module s'exécuterait au chargement de la page, donc
  // avant qu'on sache si l'on mène la rame ou si l'on suit celle d'un autre.
  assert.doesNotMatch(
    source,
    /\nrandomizeDoorTimings\(\);/,
    'un tirage à l’import consomme du hasard avant qu’on connaisse son rôle',
  );
});

test('le nettoyage du tchat s’appuie sur la borne du protocole', () => {
  // Deux constantes de longueur, l'une dans le nettoyage et l'autre dans le
  // protocole, finiraient par diverger - et l'émetteur enverrait des messages
  // que le récepteur tronquerait autrement, donc afficherait autrement.
  assert.match(read('src/systems/net/chatLimiter.ts'), /CHAT_MAX_LENGTH/);
  assert.match(read('src/systems/net/protocol.ts'), /export const CHAT_MAX_LENGTH/);
});
