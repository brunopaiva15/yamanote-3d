// L'oracle des tirages : qui tire, qui lit, et ce qui se passe quand un paquet
// se perd.
//
// Le point de conception qu'il faut protéger ici tient en une phrase : un
// suiveur privé d'une valeur ne doit JAMAIS en inventer une. Tirer un nombre au
// hasard « en attendant » fabriquerait deux mondes divergents sans que rien ne
// le signale - la rame de l'un s'arrêterait dix centimètres plus loin que celle
// de l'autre, les portes palières ne coïncideraient pas, et l'on chercherait
// pendant des semaines une désynchronisation qui ne laisse aucune trace.
//
// Le repli est donc NEUTRE, et il lève un drapeau. C'est ce drapeau qui
// déclenchera la resynchronisation dure au battement suivant.

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./fixtures/ts-resolve.mjs', import.meta.url);

const {
  applyStopDraws,
  currentStopSeq,
  beginStopDraws,
  clearDecisionDesync,
  currentStopDraws,
  decisionsDesynced,
  doorRandom,
  drawAlternativePlatform,
  drawBerthOffset,
  drawIncidentAt,
  drawIncidentGap,
  drawMelodyJitter,
  drawPassThrough,
  localBerthOffset,
  netRole,
  resetDecisions,
  setNetRole,
} = await import('../src/systems/net/worldDecisions.ts');

/**
 * Un compteur d'arrêts qui avance à chaque appel.
 *
 * Les tirages sont désormais NOMMÉS PAR ARRÊT : `beginStopDraws` ne remet la
 * table à zéro que si le numéro change. C'est ce qui permet à un suiveur de
 * recevoir le paquet vingt secondes à l'avance sans l'effacer lui-même à
 * l'entrée de la phase où il va s'en servir - le défaut qui lui coûtait une
 * resynchronisation dure à chaque gare.
 */
let arret = 0;
function prochainArret(): number {
  arret += 1;
  return arret;
}

function neuf(): void {
  resetDecisions();
  beginStopDraws(prochainArret());
}

// --- Le mode par défaut : rien ne change ----------------------------------

test('sans salon, on est en solo et l’on tire comme avant', () => {
  neuf();
  assert.equal(netRole(), 'solo');
  const vus = new Set<number>();
  for (let i = 0; i < 200; i++) {
    beginStopDraws(prochainArret());
    vus.add(drawBerthOffset(0.03, 0.11));
  }
  // Deux cents arrêts consécutifs doivent donner deux cents écarts différents :
  // si l'oracle figeait quoi que ce soit en solo, la rame se poserait toujours
  // au même endroit et l'on aurait perdu un détail que le jeu soigne.
  assert.ok(vus.size > 190, `seulement ${vus.size} écarts distincts sur 200`);
});

test('l’écart d’arrêt reste dans ses bornes, des deux côtés du repère', () => {
  neuf();
  let negatifs = 0;
  for (let i = 0; i < 500; i++) {
    beginStopDraws(prochainArret());
    const v = drawBerthOffset(0.03, 0.11);
    assert.ok(Math.abs(v) >= 0.03 - 1e-9 && Math.abs(v) <= 0.11 + 1e-9, `${v}`);
    if (v < 0) negatifs++;
  }
  assert.ok(negatifs > 150 && negatifs < 350, `${negatifs} écarts négatifs sur 500`);
});

test('le décalage de mélodie reste dans [-1, 1]', () => {
  neuf();
  for (let i = 0; i < 300; i++) {
    beginStopDraws(prochainArret());
    const v = drawMelodyJitter();
    assert.ok(v >= -1 && v <= 1, `${v}`);
  }
});

// --- Ce que l'hôte retient -------------------------------------------------

test('l’hôte retient ce qu’il tire, pour pouvoir le publier', () => {
  neuf();
  setNetRole('host');
  beginStopDraws(prochainArret());
  const ecart = drawBerthOffset(0.03, 0.11);
  const gigue = drawMelodyJitter();
  const voie = drawAlternativePlatform(0.5);
  const draws = currentStopDraws();
  assert.equal(draws.berthOffset, ecart);
  assert.equal(draws.melodyJitter, gigue);
  assert.equal(draws.alternativePlatform, voie);
});

test('un nouvel arrêt oublie les tirages du précédent', () => {
  neuf();
  setNetRole('host');
  beginStopDraws(prochainArret());
  drawBerthOffset(0.03, 0.11);
  assert.notEqual(currentStopDraws().berthOffset, undefined);
  beginStopDraws(prochainArret());
  assert.equal(currentStopDraws().berthOffset, undefined);
});

test('un tirage nommé ne se refait pas deux fois dans le même arrêt', () => {
  // Ce qui autorise à tirer TOUT l'arrêt une gare à l'avance et à laisser
  // malgré tout chaque valeur être redemandée à son heure, là où le cycle en a
  // besoin. En solo, c'est aussi ce qui empêche `dwellDuration()` - relue à
  // chaque image - de changer d'avis en cours d'arrêt.
  neuf();
  setNetRole('host');
  beginStopDraws(prochainArret());
  const ecart = drawBerthOffset(0.03, 0.11);
  for (let i = 0; i < 50; i++) assert.equal(drawBerthOffset(0.03, 0.11), ecart);
});

test('reposer le même rôle ne touche à rien', () => {
  // Le canal réélit l'hôte toutes les secondes et repose le rôle à chaque
  // passage, même inchangé. Vider la table à cette occasion, c'était la vider
  // une fois par seconde : l'hôte n'avait plus rien à publier, et le suiveur
  // perdait le paquet qu'il venait de recevoir.
  neuf();
  setNetRole('host');
  const seq = prochainArret();
  beginStopDraws(seq);
  const ecart = drawBerthOffset(0.03, 0.11);
  assert.equal(currentStopSeq(), seq);
  setNetRole('host');
  setNetRole('host');
  assert.equal(currentStopDraws().berthOffset, ecart);
  assert.equal(currentStopSeq(), seq);
});

// --- Ce que le suiveur lit -------------------------------------------------

const PAQUET = {
  berthOffset: -0.074,
  alternativePlatform: true,
  melodyJitter: 0.42,
  doorSeed: 0x1234abcd,
  passThrough: true,
};

test('le MÊME arrêt, annoncé deux fois, n’oublie rien', () => {
  // C'est LE défaut du multijoueur, et il ne se voyait qu'à deux. Le cycle
  // annonce le début d'un arrêt à plusieurs endroits ; sans numéro, chaque
  // annonce remettait la table à zéro - y compris chez un suiveur qui venait
  // de recevoir le paquet de l'hôte, vingt secondes à l'avance, exactement
  // comme le protocole le prévoit. Il tombait alors sur les replis neutres et
  // se faisait resynchroniser durement à chaque gare : parole coupée, foule
  // resemée, rapide annulé.
  neuf();
  setNetRole('follower');
  const seq = prochainArret();
  beginStopDraws(seq);
  applyStopDraws(PAQUET, seq);
  beginStopDraws(seq); // le cycle repasse par là, plus tard, pour le même arrêt
  assert.equal(currentStopDraws().berthOffset, PAQUET.berthOffset);
  assert.equal(drawBerthOffset(0.03, 0.11), PAQUET.berthOffset);
  assert.equal(decisionsDesynced(), false, 'le paquet reçu a été effacé');
});

test('un suiveur rend exactement ce qu’on lui a envoyé', () => {
  neuf();
  setNetRole('follower');
  applyStopDraws(PAQUET, arret);
  assert.equal(drawBerthOffset(0.03, 0.11), PAQUET.berthOffset);
  assert.equal(drawMelodyJitter(), PAQUET.melodyJitter);
  assert.equal(drawAlternativePlatform(0.5), PAQUET.alternativePlatform);
  assert.equal(drawPassThrough(0.9), PAQUET.passThrough);
  assert.equal(decisionsDesynced(), false);
});

test('un suiveur rend la MÊME valeur à chaque relecture', () => {
  // `dwellDuration()` est appelée à chaque image par le cycle, par le quai et
  // par l'affichage : un tirage qui changerait de réponse en cours d'arrêt
  // ferait s'ouvrir les portes deux fois.
  neuf();
  setNetRole('follower');
  applyStopDraws(PAQUET, arret);
  for (let i = 0; i < 50; i++) {
    assert.equal(drawBerthOffset(0.03, 0.11), PAQUET.berthOffset);
  }
});

test('un suiveur ignore la probabilité qu’on lui passe : seul l’hôte décide', () => {
  neuf();
  setNetRole('follower');
  applyStopDraws({ ...PAQUET, alternativePlatform: true }, arret);
  // Chance nulle, et pourtant : la décision vient de l'hôte, pas du calcul local.
  assert.equal(drawAlternativePlatform(0), true);
});

// --- LE test : le paquet perdu --------------------------------------------

test('un suiveur privé de valeur rend le repli NEUTRE et lève le drapeau', () => {
  neuf();
  setNetRole('follower');
  beginStopDraws(prochainArret()); // nouvel arrêt, et rien n'est arrivé

  assert.equal(decisionsDesynced(), false);
  assert.equal(drawBerthOffset(0.03, 0.11), 0, 'une rame pile sur son repère');
  assert.equal(decisionsDesynced(), true, 'le manque doit se signaler');

  clearDecisionDesync();
  assert.equal(drawAlternativePlatform(1), false, 'la voie principale existe partout');
  assert.equal(decisionsDesynced(), true);

  clearDecisionDesync();
  assert.equal(drawMelodyJitter(), 0, 'l’instant nominal de la mélodie');
  assert.equal(decisionsDesynced(), true);

  clearDecisionDesync();
  assert.equal(drawPassThrough(1), false, 'un train en moins ne gêne personne');
  assert.equal(decisionsDesynced(), true);
});

test('le repli d’un suiveur n’est jamais aléatoire', () => {
  // C'est la propriété qui compte : deux suiveurs également privés du paquet
  // doivent au moins se tromper DE LA MÊME FAÇON. Un repli tiré au sort les
  // ferait diverger l'un de l'autre en plus de diverger de l'hôte.
  neuf();
  setNetRole('follower');
  const vus = new Set<number>();
  for (let i = 0; i < 100; i++) {
    beginStopDraws(prochainArret());
    vus.add(drawBerthOffset(0.03, 0.11));
  }
  assert.equal(vus.size, 1, 'le repli varie : deux suiveurs ne se ressembleraient pas');
});

test('recevoir un paquet efface le drapeau', () => {
  neuf();
  setNetRole('follower');
  beginStopDraws(prochainArret());
  drawBerthOffset(0.03, 0.11);
  assert.equal(decisionsDesynced(), true);
  applyStopDraws(PAQUET, arret);
  assert.equal(decisionsDesynced(), false);
});

test('changer de rôle repart d’une page blanche', () => {
  // Un ancien hôte qui devient suiveur n'a plus rien à publier, et ses propres
  // tirages ne valent plus rien : les garder lui ferait croire qu'il est
  // d'accord avec un hôte à qui il n'a rien demandé.
  neuf();
  setNetRole('host');
  beginStopDraws(prochainArret());
  drawBerthOffset(0.03, 0.11);
  setNetRole('follower');
  assert.equal(currentStopDraws().berthOffset, undefined);
  assert.equal(decisionsDesynced(), false);
});

// --- Les incidents ---------------------------------------------------------

test('un suiveur ne planifie aucun incident : il attend l’ordre de l’hôte', () => {
  // Plutôt que d'ajouter une condition à chaque endroit du cycle où un incident
  // peut naître, on rend au suiveur une échéance qui n'arrive pas. La machine à
  // états reste identique dans les deux rôles, ce qui est exactement ce qu'on
  // attend d'un monde qu'on prétend partagé.
  neuf();
  setNetRole('follower');
  assert.ok(drawIncidentGap(2, 6) > 1_000, 'une urgence pourrait se déclencher toute seule');
  assert.equal(drawIncidentAt(20, 40), Number.POSITIVE_INFINITY);
});

test('en solo et chez l’hôte, les incidents gardent leurs bornes', () => {
  for (const role of ['solo', 'host'] as const) {
    neuf();
    setNetRole(role);
    for (let i = 0; i < 200; i++) {
      const g = drawIncidentGap(2, 6);
      assert.ok(g >= 2 && g <= 6 && Number.isInteger(g), `${role} : écart ${g}`);
      const at = drawIncidentAt(20, 40);
      assert.ok(at >= 20 && at <= 60, `${role} : instant ${at}`);
    }
  }
});

// --- La graine des portes --------------------------------------------------

test('une même graine donne exactement la même suite de retards', () => {
  neuf();
  setNetRole('follower');
  applyStopDraws(PAQUET, arret);
  const a = Array.from({ length: 38 }, () => doorRandom()());
  applyStopDraws(PAQUET, arret);
  const b = Array.from({ length: 38 }, () => doorRandom()());
  assert.deepEqual(a, b);
});

test('deux graines différentes donnent deux suites différentes', () => {
  neuf();
  setNetRole('follower');
  applyStopDraws(PAQUET, arret);
  const a = doorRandom();
  const suiteA = Array.from({ length: 10 }, () => a());
  applyStopDraws({ ...PAQUET, doorSeed: 0xdeadbeef }, arret);
  const b = doorRandom();
  const suiteB = Array.from({ length: 10 }, () => b());
  assert.notDeepEqual(suiteA, suiteB);
});

test('un générateur semé déroule bien trente-huit nombres distincts', () => {
  neuf();
  setNetRole('follower');
  applyStopDraws(PAQUET, arret);
  const r = doorRandom();
  const tirages = Array.from({ length: 38 }, () => r());
  assert.equal(new Set(tirages).size, 38);
  for (const v of tirages) assert.ok(v >= 0 && v < 1, `${v}`);
});

// --- La porte de sortie locale --------------------------------------------

test('la rame qu’on attend sur un quai ne passe pas par le fil', () => {
  // Sans cette porte de sortie, un suiveur en attente sur un quai réclamerait à
  // chaque rame une valeur que personne ne lui a envoyée, et déclencherait une
  // resynchronisation dure toutes les deux minutes - alors qu'il ne se passe
  // strictement rien.
  neuf();
  setNetRole('follower');
  beginStopDraws(prochainArret());
  const vus = new Set<number>();
  for (let i = 0; i < 100; i++) vus.add(localBerthOffset(0.03, 0.11));
  assert.ok(vus.size > 90, 'le tirage local devrait varier');
  assert.equal(decisionsDesynced(), false, 'aucune désynchronisation ne doit être signalée');
});
