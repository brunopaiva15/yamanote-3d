// La version sonore du jeu (src/AudioGame.tsx et ce qui la fait tourner).
//
// Trois promesses sont tenues ici, et une seule d'entre elles est une histoire
// de code : les deux autres sont des promesses faites au joueur, et rien dans
// le typage ne les protège.
//
//  1. « sans la 3D » veut dire SANS three.js. Pas « sans toile », pas « sans
//     WebGL » : sans le moteur de rendu du tout, sept cent kilo-octets qu'une
//     machine qui choisit cette version n'a aucune raison de télécharger. La
//     garantie n'est pas une intention, c'est le graphe d'imports - et il se
//     casse au premier `import` distrait dans un module de simulation. On le
//     PARCOURT donc, depuis les trois racines que la version sonore charge.
//
//  2. le jeu qui tourne est LE MÊME. Ce qui s'entend dans la rame doit
//     s'entendre ici : les voyageurs, la foule du quai, la porte qu'on bloque,
//     l'agent de quai, et tout ce que mène `stationCycle` - arrêts d'urgence,
//     coupures de caténaire, assistance à un voyageur. On vérifie que la boucle
//     sonore appelle bien ces machines-là, parce que la tentation d'en retirer
//     une « qui ne se voit pas » est exactement l'erreur que ce test attrape.
//
//  3. la ligne continue de tourner derrière un onglet caché. C'est le cas
//     d'usage même de cette version - on la lance et on va travailler
//     ailleurs -, et `requestAnimationFrame` ne le permet pas : le navigateur
//     cesse de l'appeler dès que la page n'est plus regardée.
//
//  4. le voyage se fait ASSIS. On ne descend pas d'un train sans marcher, et
//     la version sonore n'a pas de corps à faire marcher : elle ne doit donc
//     offrir aucun raccourci vers le quai. C'est une promesse facile à rompre
//     par commodité - « un bouton, ce n'est pas grand-chose » - et c'est
//     exactement pour cela qu'elle est écrite ici.
//
// Le graphe est lu dans les SOURCES plutôt que dans le build : un test qui
// dépend de `npm run build` ne tourne pas en développement, et celui-ci doit
// échouer à la seconde où l'import de trop est écrit.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');

/** Les trois portes d'entrée de la version sonore. */
const ROOTS = [
  'src/AudioGame.tsx',
  'src/systems/audioLoop.ts',
  // Chargé par le menu au moment d'embarquer, dans les DEUX versions : s'il
  // tire three, la version sonore le tire aussi.
  'src/systems/startGame.ts',
];

const EXTENSIONS = ['.ts', '.tsx', '/index.ts', '/index.tsx'];

function resolveImport(fromFile: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null;
  const base = resolvePath(ROOT, dirname(fromFile), specifier);
  for (const ext of ['', ...EXTENSIONS]) {
    const candidate = base + ext;
    if (existsSync(candidate) && !candidate.endsWith('/')) {
      try {
        if (readFileSync(candidate).length >= 0) return candidate.slice(ROOT.length + 1);
      } catch {
        /* répertoire : on continue */
      }
    }
  }
  return null;
}

/**
 * Les modules importés à l'EXÉCUTION, imports de type exclus.
 *
 * `import type { X } from './y'` est effacé à la compilation et ne crée aucune
 * arête réelle : le compter ferait échouer ce test sur des liens qui n'existent
 * pas dans le bundle. C'est le cas, par exemple, de `data/products`, qui
 * n'emprunte à `textures/vending` que la forme d'une marque.
 */
function runtimeImports(file: string): string[] {
  const source = readFileSync(resolvePath(ROOT, file), 'utf8');
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

test('la version sonore ne charge pas three.js', () => {
  const seen = new Set<string>();
  const parent = new Map<string, string>();
  const offenders: string[] = [];
  const stack = [...ROOTS];
  while (stack.length) {
    const file = stack.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const spec of runtimeImports(file)) {
      if (spec === 'three' || spec.startsWith('three/') || spec.startsWith('@react-three')) {
        // La chaîne complète, sinon le message ne dit pas où réparer.
        const chain: string[] = [file];
        for (let c = parent.get(file); c; c = parent.get(c)) chain.push(c);
        offenders.push(`${chain.reverse().join(' → ')} → ${spec}`);
        continue;
      }
      const next = resolveImport(file, spec);
      if (!next) continue;
      if (!parent.has(next)) parent.set(next, file);
      stack.push(next);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `La version sonore doit rester sans moteur de rendu.\n${offenders.join('\n')}`,
  );
  // Garde-fou du garde-fou : si le parcours ne trouvait plus rien (chemin
  // renommé, expression d'import changée), il passerait en silence.
  assert.ok(seen.size > 40, `parcours anormalement court : ${seen.size} modules`);
});

test('la boucle sonore fait tourner tout ce qui s’entend', () => {
  const loop = readFileSync(resolvePath(ROOT, 'src/systems/audioLoop.ts'), 'utf8');
  for (const call of [
    // La marche du train, les gares, et avec elles les arrêts d'urgence, les
    // coupures de caténaire et l'assistance à un voyageur - c'est stationCycle
    // qui les tire au sort et les mène.
    'updateCycle(',
    'updateDoorMotion(',
    // La porte qu'on bloque, et l'agent qui vient s'en occuper.
    'updateDoorObstruction(',
    'updatePlatformAgentSpeech(',
    // Les voyageurs et la foule : éternuements, toux, sacs, bousculades.
    'updatePassengers(',
    'updatePlatformCrowd(',
    'updatePetCarriers(',
    // Le train d'en face, la météo, le tronçon, la présence du quai.
    'updatePassingTrain(',
    'updateWeather(',
    'updateSegmentEnv(',
    'updatePlatformPresence(',
    // Le mixage, publié une fois par image : les niveaux de la rame et
    // l'ambiance sont DEDANS (systems/audioFrame), et non plus appelés depuis
    // la boucle de sous-pas - vingt reprogrammations de Tone par image pour un
    // résultat identique, c'était le grésillement sur machine modeste.
    'publishAudioEnvironment(physSpan)',
  ]) {
    assert.ok(loop.includes(call), `la boucle sonore n’appelle plus ${call})`);
  }
});

test('le voyage sonore se fait assis, sans descendre sur le quai', () => {
  const loop = readFileSync(resolvePath(ROOT, 'src/systems/audioLoop.ts'), 'utf8');
  // La machine à états du quai n'a rien à faire ici : sans corps, on ne
  // franchit pas de seuil, et `runtime.playerFrame` ne quitte jamais la rame.
  assert.ok(
    !loop.includes('updatePlatformWait('),
    'la boucle sonore ne doit pas faire tourner l’attente sur le quai',
  );
  // Et aucun raccourci ne doit rouvrir la porte par la bande.
  for (const file of ['src/AudioGame.tsx', 'src/ui/audio/DoorState.tsx']) {
    const source = readFileSync(resolvePath(ROOT, file), 'utf8');
    for (const forbidden of ['/boarding', 'alight(', 'crossDoorway(', 'crossNearestPortal(']) {
      assert.ok(!source.includes(forbidden), `${file} ne doit pas faire descendre (${forbidden})`);
    }
  }
});

test('la ligne tourne derrière un onglet caché', () => {
  const loop = readFileSync(resolvePath(ROOT, 'src/systems/audioLoop.ts'), 'utf8');
  // Un SECOND moteur d'horloge, et la bascule qui va avec : rAF seul se tait
  // dès que la page n'est plus regardée, et la ligne se figerait sur un
  // ronflement de roulement sans gare ni annonce.
  assert.match(loop, /setInterval\(/, 'pas de moteur d’horloge pour l’onglet caché');
  assert.match(loop, /visibilitychange/, 'la bascule de moteur n’est pas branchée');
  assert.match(loop, /document\.hidden/, 'la visibilité de la page n’est pas consultée');
  // Et jamais les deux ensemble : le train irait deux fois trop vite.
  assert.match(loop, /function stopDrivers\(\)/, 'rien n’arrête le pilote sortant');
});

test('l’afficheur ne se repeint pas pour personne', () => {
  const screen = readFileSync(resolvePath(ROOT, 'src/ui/audio/LineScreen.tsx'), 'utf8');
  // Deux mille lignes de canevas prises sur le fil audio, pour une dalle que
  // personne ne regarde : c'est exactement ce que la version sonore promet
  // d'éviter sur une machine modeste.
  assert.match(screen, /document\.hidden/, 'la dalle se repeint même page cachée');
});

test('le bouton plein écran n’entrave pas la vue de l’afficheur', () => {
  const screen = readFileSync(resolvePath(ROOT, 'src/ui/audio/LineScreen.tsx'), 'utf8');
  // La dalle ne porte QUE la dalle. Un bouton posé dessus couvrirait sa note de
  // bas d'écran au survol, et y resterait en permanence au doigt, faute de
  // survol : il vit sur la réglette de porte, qui est du décor autour de
  // l'écran et non l'écran.
  assert.ok(!screen.includes('<button'), 'l’afficheur ne doit porter aucun bouton');
  const doors = readFileSync(resolvePath(ROOT, 'src/ui/audio/DoorState.tsx'), 'utf8');
  assert.match(doors, /toggleFullscreenOf\(/, 'la réglette ne porte pas le plein écran');
});

test('l’afficheur se peint à la résolution de l’écran', () => {
  const screen = readFileSync(resolvePath(ROOT, 'src/ui/audio/LineScreen.tsx'), 'utf8');
  // En plein écran, une dalle de 768 pixels agrandie serait une capture
  // d'écran étirée. La peinture garde sa grille - toutes ses cotes y sont
  // relevées - et c'est la mémoire d'image qui grandit, sous une
  // transformation d'échelle : le texte est alors TRACÉ net, pas interpolé.
  assert.match(screen, /devicePixelRatio/, 'la densité d’écran n’est pas prise en compte');
  assert.match(screen, /setTransform\(/, 'la peinture n’est pas mise à l’échelle');
});
