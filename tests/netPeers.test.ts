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
  // Le partant n'est plus DU SALON tout de suite - il sort du roster, donc de
  // l'effectif affiché - mais son avatar s'en va en fondu plutôt que de
  // disparaître d'une image à l'autre.
  assert.deepEqual(rosterSnapshot().map((r) => r.id).sort(), ['b', 'c']);
  assert.equal(peers.get('a')?.gone, true);
  for (let i = 0; i < 60; i++) updatePeers(1 / 60, 200);
  assert.deepEqual([...peers.keys()].sort(), ['b', 'c']);
});

test('un partant qui revient avant la fin du fondu est rattrapé en vol', () => {
  clearPeers();
  syncRoster([annonce('a', 1)], 'moi', 0);
  for (let i = 0; i < 60; i++) updatePeers(1 / 60, 0);
  syncRoster([], 'moi', 100);
  updatePeers(0.1, 100);
  assert.equal(peers.get('a')?.gone, true);
  syncRoster([annonce('a', 1)], 'moi', 200);
  assert.equal(peers.get('a')?.gone, false, 'le retour n’a pas annulé le départ');
  for (let i = 0; i < 60; i++) updatePeers(1 / 60, 200);
  assert.equal(peers.get('a')?.fade, 1);
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

test('un pair muet GRISE, il ne s’efface pas', () => {
  // Le défaut rapporté : « quand je laisse la tab en arrière-plan, ça fait
  // disparaître le perso ». Un onglet caché voit son requestAnimationFrame
  // suspendu, donc ses poses cessent - mais sa présence, elle, tient très bien
  // sur la socket. Il est toujours là ; il ne dit simplement plus où il est.
  clearPeers();
  syncRoster([annonce('a', 1)], 'moi', 0);
  receivePose('a', pose(0), 0);
  for (let i = 0; i < 60; i++) updatePeers(1 / 60, 100);
  assert.equal(peers.get('a')?.fade, 1);
  assert.equal(peers.get('a')?.away, 0);

  // Il se tait longtemps : il grise, et il RESTE.
  for (let i = 0; i < 120; i++) updatePeers(1 / 60, 5_000);
  assert.equal(peers.get('a')?.away, 1, 'il aurait dû griser');
  assert.equal(peers.get('a')?.fade, 1, 'le silence n’est pas un départ');

  // Il revient : la couleur revient avec lui, sans qu'il ait clignoté.
  receivePose('a', pose(5_000), 5_000);
  for (let i = 0; i < 120; i++) updatePeers(1 / 60, 5_000);
  assert.equal(peers.get('a')?.away, 0);
});

test('le gris ne sort jamais de [0, 1]', () => {
  clearPeers();
  syncRoster([annonce('a', 1)], 'moi', 0);
  receivePose('a', pose(0), 0);
  for (let i = 0; i < 200; i++) {
    updatePeers(0.5, i % 2 === 0 ? 0 : 999_999);
    const a = peers.get('a')!.away;
    assert.ok(a >= 0 && a <= 1, `gris hors bornes : ${a}`);
  }
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

// --- Les horloges, qui ne sont pas d'accord ---------------------------------
//
// Le défaut le plus coûteux de tout le multijoueur, et le plus silencieux : une
// pose porte l'horodatage de la machine qui l'émet, et tout ce qui la relit
// raisonne avec la nôtre. Rien n'oblige deux navigateurs à être d'accord à la
// milliseconde. Quand celui d'en face retardait, ses poses semblaient périmées
// dès leur arrivée : son avatar n'était jamais dessiné, alors que son nom
// figurait au salon et que son tchat s'affichait.

test('un ami dont l’horloge retarde est quand même visible', () => {
  clearPeers();
  syncRoster([annonce('a', 1)], 'moi', 0);
  // Son horloge a cinq secondes de retard sur la nôtre. Il émet à 8 Hz.
  const RETARD = -5_000;
  for (let i = 0; i < 8; i++) {
    const now = i * 125;
    receivePose('a', pose(now + RETARD, i), now);
  }
  // Il vient de parler : rien ne doit être périmé.
  const pair = peers.get('a')!;
  updatePeers(1 / 60, 900);
  assert.ok(pair.fade > 0, 'l’avatar reste invisible : le décalage d’horloge n’est pas rattrapé');
  for (let i = 0; i < 60; i++) updatePeers(1 / 60, 900);
  assert.equal(pair.fade, 1);
});

test('un ami dont l’horloge avance est visible lui aussi', () => {
  clearPeers();
  syncRoster([annonce('a', 1)], 'moi', 0);
  const AVANCE = 5_000;
  for (let i = 0; i < 8; i++) {
    const now = i * 125;
    receivePose('a', pose(now + AVANCE, i), now);
  }
  for (let i = 0; i < 60; i++) updatePeers(1 / 60, 900);
  assert.equal(peers.get('a')?.fade, 1);
});

test('le décalage ramène les poses sur NOTRE horloge, sans toucher aux écarts', () => {
  // Ce que le tampon garde doit se lire avec nos propres instants, et les
  // intervalles de l'émetteur doivent survivre intacts : c'est d'eux que
  // l'interpolation tire sa régularité.
  clearPeers();
  syncRoster([annonce('a', 1)], 'moi', 0);
  receivePose('a', pose(1_000_000, 0), 100);
  receivePose('a', pose(1_000_125, 1), 225);
  receivePose('a', pose(1_000_250, 2), 350);
  const instants = peers.get('a')!.poses.map((p) => p.t);
  assert.deepEqual(instants, [100, 225, 350]);
});

test('le décalage s’affine sur le paquet le plus rapide, tampon compris', () => {
  // La gigue ne fait qu'AJOUTER du retard : le plus petit écart observé est le
  // moins pollué. Quand l'estimation s'améliore, les échantillons déjà rangés
  // doivent suivre - un tampon converti avec deux décalages différents ferait
  // sauter l'avatar.
  clearPeers();
  syncRoster([annonce('a', 1)], 'moi', 0);
  // Première pose : 300 ms de transit, dont on ne sait rien encore.
  receivePose('a', pose(0, 0), 300);
  // La suivante passe en 50 ms : voilà la meilleure estimation.
  receivePose('a', pose(125, 1), 175);
  const instants = peers.get('a')!.poses.map((p) => p.t);
  assert.deepEqual(instants, [50, 175], 'le tampon n’a pas suivi le nouveau décalage');
  const buf = peers.get('a')!.poses;
  for (let i = 1; i < buf.length; i++) {
    assert.ok(buf[i].t > buf[i - 1].t, 'le tampon n’est plus trié');
  }
});

test('une horloge qui saute franchement fait repartir l’estimation', () => {
  // Machine qui sort de veille, correction NTP, fuseau changé : au-delà d'une
  // demi-minute, ce n'est plus du réseau. On se réaligne plutôt que de traîner
  // un décalage devenu faux - sans quoi le pair resterait invisible pour de bon.
  clearPeers();
  syncRoster([annonce('a', 1)], 'moi', 0);
  receivePose('a', pose(0, 0), 0);
  // Son horloge recule d'une minute : sans réalignement, ses poses paraîtraient
  // vieilles d'une minute et il s'effacerait.
  receivePose('a', pose(1_000 - 60_000, 1), 1_000);
  const pair = peers.get('a')!;
  assert.equal(pair.poses[pair.poses.length - 1].t, 1_000);
  for (let i = 0; i < 60; i++) updatePeers(1 / 60, 1_100);
  assert.equal(pair.fade, 1);
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
