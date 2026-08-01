// Ce que le jeu a le droit de faire selon l'ÉTAGE où se tient le joueur.
//
// `playerFrame === 'platform'` est un repère de COORDONNÉES, et le hall de
// correspondance y vit aussi : la gare y est épinglée de la même façon, le
// quai s'y retourne du même côté. Une douzaine de modules lisaient pourtant ce
// drapeau pour répondre à une question toute différente - « le joueur est-il
// PHYSIQUEMENT sur la dalle ? » -, et depuis qu'on descend, la réponse n'est
// plus la même :
//
//   · l'invite « monter à bord » s'affichait au fond d'un couloir souterrain,
//     et le raccourci de franchissement téléportait sur le quai depuis trois
//     mètres cinquante sous les roues ;
//   · on adressait la parole à quelqu'un qui attendait de l'autre côté d'une
//     dalle de béton ;
//   · la foule du quai esquivait, regardait et commentait un joueur absent ;
//   · l'ambiance sonore du quai sortait à plein volume dans le hall.
//
// `onPlatformDeck()` répond à cette question-là, et ce fichier la fige.

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./fixtures/ts-resolve.mjs', import.meta.url);

const { onPlatformDeck, runtime } = await import('../src/systems/runtime.ts');
const { nearestOpenPortal } = await import('../src/systems/walkable.ts');
const { useStore } = await import('../src/store.ts');
const { DOOR_SIDE } = await import('../src/data/stations.ts');
const { CONFIG } = await import('../src/data/config.ts');

/** Une rame à quai, portes grandes ouvertes : tout est réuni pour monter. */
function trainAtPlatform(): void {
  useStore.setState({
    doorSide: DOOR_SIDE[0],
    index: 0,
    platformIndex: 0,
    started: true,
  });
  runtime.trainPresent = true;
  runtime.trainZ = 0;
  runtime.platformSlide = 0;
  runtime.speed = 0;
  runtime.doorOpen = 1;
  runtime.psdOpen = 1;
  runtime.psdPresent = true;
  runtime.playerFrame = 'platform';
  runtime.playerLevel = 'platform';
}

test('le prédicat ne confond pas le repère et l’étage', () => {
  trainAtPlatform();
  assert.equal(onPlatformDeck(), true);

  runtime.playerLevel = 'concourse';
  assert.equal(onPlatformDeck(), false, 'descendu dans le hall');

  runtime.playerLevel = 'platform';
  runtime.playerFrame = 'car';
  assert.equal(onPlatformDeck(), false, 'remonté à bord');
});

test('on ne monte pas dans un train depuis le hall', () => {
  trainAtPlatform();
  // Sur le quai, à l'aplomb d'une porte : le seuil est là.
  const side = DOOR_SIDE[0];
  const doorZ = CONFIG.doorCenters[2];
  const x = side * 2.4;
  assert.notEqual(nearestOpenPortal(x, doorZ), null, 'seuil introuvable depuis le quai');

  // Le même point, mais un étage plus bas : plus rien. La porte est ouverte,
  // la rame est là, elle est simplement hors de portée - il y a une dalle.
  runtime.playerLevel = 'concourse';
  assert.equal(nearestOpenPortal(x, doorZ), null, 'seuil offert depuis le hall');
});

// La visée des voyageurs (`systems/paxTargeting`) suit la même règle et lit le
// même prédicat, mais elle n'est pas vérifiable ici : elle importe la foule du
// quai, qui lit `import.meta.env` au chargement et n'existe donc que sous Vite.
// Ce qui est gelé ci-dessus - le prédicat lui-même - est ce dont elle dépend.
