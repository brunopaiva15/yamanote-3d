// Le roster : qui est là, et ce qu'on garde de lui entre deux annonces.
//
// Deux pièges se cachent dans un roster, et ils ne se voient qu'en jouant à
// plusieurs - donc trop tard.
//
// Le premier : se mettre soi-même dans la liste des autres. On se retrouve avec
// un avatar planté dans sa propre caméra, ce qui est la première chose qu'on
// remarque et la dernière à laquelle on pense.
//
// Le second, plus vicieux : reconstruire un pair à chaque annonce de présence.
// La présence est republiée chaque fois qu'un drapeau change - typiquement quand
// quelqu'un descend sur le quai. Si l'on jette son tampon de poses au passage,
// son avatar se fige, saute, puis reprend. On ne comprend jamais pourquoi.

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./fixtures/ts-resolve.mjs', import.meta.url);

const { clearPeers, lastSeenMap, peers, receivePose, rosterSnapshot, syncRoster, updatePeers } =
  await import('../src/systems/net/peers.ts');

type Annonce = Parameters<typeof syncRoster>[0][number];

function annonce(id: string, joinedAt: number, over: Partial<Annonce> = {}): Annonce {
  return { id, name: id, avatar: 1, mode: 'full', attached: true, joinedAt, ...over };
}

function pose(t: number, x = 0) {
  return {
    t,
    x,
    y: 1.55,
    z: 0,
    yaw: 0,
    pitch: 0,
    frame: 0 as const,
    level: 0 as const,
    station: 0,
    seated: false,
    moving: false,
  };
}

test('on ne se met jamais soi-même dans le roster des autres', () => {
  clearPeers();
  syncRoster([annonce('moi', 1), annonce('toi', 2)], 'moi', 100);
  assert.equal(peers.has('moi'), false, 'un avatar planté dans sa propre caméra');
  assert.equal(peers.has('toi'), true);
});

test('les arrivants entrent, les partants sortent', () => {
  clearPeers();
  syncRoster([annonce('a', 1), annonce('b', 2)], 'moi', 100);
  assert.equal(peers.size, 2);
  syncRoster([annonce('b', 2), annonce('c', 3)], 'moi', 200);
  assert.deepEqual([...peers.keys()].sort(), ['b', 'c']);
});

test('une republication de présence ne jette PAS le tampon de poses', () => {
  // C'est le test qui compte. Descendre sur le quai republie la présence avec
  // `attached: false` ; reconstruire le pair au passage ferait sauter son
  // avatar à chaque fois que quelqu'un franchit une porte.
  clearPeers();
  syncRoster([annonce('a', 1)], 'moi', 100);
  receivePose('a', pose(100, 1), 100);
  receivePose('a', pose(225, 2), 225);
  assert.equal(peers.get('a')?.poses.length, 2);

  syncRoster([annonce('a', 1, { attached: false })], 'moi', 300);
  assert.equal(peers.get('a')?.poses.length, 2, 'le tampon a été jeté');
  assert.equal(peers.get('a')?.attached, false, 'le drapeau n’a pas été repris');
});

test('un changement de nom ou d’apparence est repris sans reconstruire', () => {
  clearPeers();
  syncRoster([annonce('a', 1, { name: 'Aya', avatar: 7 })], 'moi', 100);
  receivePose('a', pose(100), 100);
  syncRoster([annonce('a', 1, { name: 'Ayaka', avatar: 9 })], 'moi', 200);
  assert.equal(peers.get('a')?.name, 'Ayaka');
  assert.equal(peers.get('a')?.avatar, 9);
  assert.equal(peers.get('a')?.poses.length, 1);
});

test('le roster est trié par ancienneté, et le tri est total', () => {
  // Deux clients doivent afficher la même liste dans le même ordre : sinon le
  // « troisième voyageur » de l'un n'est pas celui de l'autre.
  clearPeers();
  syncRoster([annonce('zoe', 5), annonce('ada', 5), annonce('bob', 1)], 'moi', 100);
  assert.deepEqual(
    rosterSnapshot().map((p) => p.id),
    ['bob', 'ada', 'zoe'],
  );
});

test('une pose reçue d’un inconnu est ignorée sans exploser', () => {
  // La présence et la diffusion n'arrivent pas dans un ordre garanti : une pose
  // peut parfaitement précéder l'annonce de son émetteur.
  clearPeers();
  receivePose('fantome', pose(100), 100);
  assert.equal(peers.size, 0);
});

test('un pair muet s’efface, un pair bavard revient', () => {
  clearPeers();
  syncRoster([annonce('a', 1)], 'moi', 0);
  receivePose('a', pose(0), 0);
  // Il parle : le fondu monte jusqu'à un.
  for (let i = 0; i < 60; i++) updatePeers(1 / 60, 100);
  assert.equal(peers.get('a')?.fade, 1);
  // Il se tait plus d'une seconde : le fondu redescend, mais pas d'un coup.
  updatePeers(1 / 60, 5_000);
  const apresUneImage = peers.get('a')!.fade;
  assert.ok(apresUneImage < 1 && apresUneImage > 0.9, `fondu ${apresUneImage}`);
  for (let i = 0; i < 60; i++) updatePeers(1 / 60, 5_000);
  assert.equal(peers.get('a')?.fade, 0);
});

test('le fondu ne sort jamais de [0, 1]', () => {
  clearPeers();
  syncRoster([annonce('a', 1)], 'moi', 0);
  receivePose('a', pose(0), 0);
  for (let i = 0; i < 200; i++) {
    updatePeers(0.5, i % 2 === 0 ? 0 : 999_999);
    const f = peers.get('a')!.fade;
    assert.ok(f >= 0 && f <= 1, `fondu hors bornes : ${f}`);
  }
});

test('la table des dernières nouvelles alimente l’élection', () => {
  clearPeers();
  syncRoster([annonce('a', 1), annonce('b', 2)], 'moi', 100);
  receivePose('a', pose(500), 500);
  const vus = lastSeenMap();
  assert.equal(vus.get('a'), 500);
  assert.equal(vus.get('b'), 100, 'un pair jamais entendu date de son arrivée');
});

test('quitter le salon ne laisse personne derrière', () => {
  clearPeers();
  syncRoster([annonce('a', 1), annonce('b', 2)], 'moi', 100);
  clearPeers();
  assert.equal(peers.size, 0);
  assert.deepEqual(rosterSnapshot(), []);
});
