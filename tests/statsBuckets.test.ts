// Le découpage du temps de la page de fréquentation.
//
// Le fuseau est FIXÉ à Europe/Zurich avant tout autre import, et ce n'est pas
// un détail de confort : ce module découpe des journées locales, et les deux
// dimanches de changement d'heure sont exactement les endroits où un découpage
// se trompe sans rien dire. Sous UTC - le fuseau des runners GitHub - aucun de
// ces cas n'existerait, et le test passerait en ne vérifiant rien.
//
// Ce qui casserait en silence sans ce fichier : un histogramme dont les barres
// glissent d'une heure à partir de fin mars, une nuit déserte qui disparaît de
// l'axe au lieu d'afficher zéro, ou la boucle de fabrication des créneaux qui
// ne s'arrête jamais sur l'heure qui n'existe pas.

process.env.TZ = 'Europe/Zurich';

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./fixtures/ts-resolve.mjs', import.meta.url);

const {
  MAX_SLOTS,
  allowedBuckets,
  defaultBucket,
  gridTicks,
  labelStep,
  niceMax,
  shortLabel,
  slotKey,
  slotSequence,
  truncLocal,
} = await import('../src/stats/buckets.ts');

test('le fuseau du test est bien celui qu’on croit', () => {
  // Si cette ligne échoue, tous les cas de changement d'heure ci-dessous ne
  // vérifient plus rien - autant le dire ici plutôt que de les voir passer.
  assert.equal(Intl.DateTimeFormat().resolvedOptions().timeZone, 'Europe/Zurich');
});

test('une journée ordinaire fait vingt-quatre créneaux horaires', () => {
  const creneaux = slotSequence('hour', new Date(2026, 5, 10, 0, 0), new Date(2026, 5, 10, 23, 59));
  assert.equal(creneaux.length, 24);
  assert.equal(creneaux[0].getHours(), 0);
  assert.equal(creneaux[23].getHours(), 23);
});

test('la nuit où l’on avance les montres n’a que vingt-trois heures', () => {
  // 29 mars 2026 : à 2 h il est 3 h. L'heure de 2 h n'existe pas, et l'axe ne
  // doit pas l'inventer - une barre vide qui n'est pas un creux mais un trou de
  // calendrier se lirait comme une panne du site.
  const creneaux = slotSequence('hour', new Date(2026, 2, 29, 0, 0), new Date(2026, 2, 29, 23, 59));
  assert.equal(creneaux.length, 23);
  assert.ok(!creneaux.some((d) => d.getHours() === 2), 'l’heure sautée est réapparue');
});

test('la nuit où l’on recule les montres ne compte pas deux fois deux heures', () => {
  // 25 octobre 2026 : vingt-cinq heures réelles, mais deux d'entre elles
  // s'appellent « 2 h ». PostgreSQL n'en rend qu'un créneau (il regroupe sur
  // l'heure de calendrier) : l'axe doit s'aligner sur lui, sinon une barre
  // resterait vide toute l'année suivante en attendant une donnée qui n'arrive
  // jamais.
  const creneaux = slotSequence('hour', new Date(2026, 9, 25, 0, 0), new Date(2026, 9, 25, 23, 59));
  assert.equal(creneaux.length, 24);
  const cles = creneaux.map((d) => slotKey('hour', d));
  assert.equal(new Set(cles).size, cles.length, 'deux créneaux portent la même étiquette');
});

test('les jours avancent par le calendrier, pas par 86 400 000 millisecondes', () => {
  // La semaine du changement d'heure : une arithmétique en millisecondes
  // décalerait tout ce qui suit d'une heure, donc une nuit sur deux d'un jour.
  const creneaux = slotSequence('day', new Date(2026, 2, 27), new Date(2026, 3, 2, 23, 59));
  assert.deepEqual(
    creneaux.map((d) => `${d.getDate()}/${d.getMonth() + 1}`),
    ['27/3', '28/3', '29/3', '30/3', '31/3', '1/4', '2/4'],
  );
  for (const d of creneaux) assert.equal(d.getHours(), 0, 'un jour ne commence pas à minuit');
});

test('les semaines commencent le lundi, comme date_trunc de PostgreSQL', () => {
  // Le 8 août 2026 est un samedi ; sa semaine commence le lundi 3.
  const lundi = truncLocal('week', new Date(2026, 7, 8, 15, 30));
  assert.equal(lundi.getDay(), 1);
  assert.equal(lundi.getDate(), 3);
  const creneaux = slotSequence('week', new Date(2026, 7, 8), new Date(2026, 7, 29));
  assert.deepEqual(creneaux.map((d) => d.getDate()), [3, 10, 17, 24]);
});

test('les mois tombent sur le premier, quelle que soit leur longueur', () => {
  const creneaux = slotSequence('month', new Date(2026, 0, 31), new Date(2026, 3, 5));
  assert.deepEqual(
    creneaux.map((d) => slotKey('month', d)),
    ['2026-01', '2026-02', '2026-03', '2026-04'],
  );
});

test('l’étiquette d’un instant est celle de son créneau, pas de son heure', () => {
  // C'est le seul point de contact entre l'axe fabriqué ici et les comptes
  // renvoyés par le serveur : deux instants de la même heure locale doivent
  // rendre la même clé, sinon la barre reste à zéro alors que la donnée est là.
  const debut = new Date(2026, 7, 7, 14, 0);
  const milieu = new Date(2026, 7, 7, 14, 47, 12);
  assert.equal(slotKey('hour', debut), slotKey('hour', milieu));
  assert.equal(slotKey('hour', debut), '2026-08-07T14');
  assert.equal(slotKey('day', milieu), '2026-08-07');
  assert.equal(slotKey('week', milieu), '2026-08-03');
  assert.equal(slotKey('month', milieu), '2026-08');
});

test('la fabrication des créneaux s’arrête toujours', () => {
  // Une borne de fin absurde ne doit pas faire tourner la page indéfiniment.
  const creneaux = slotSequence('hour', new Date(2020, 0, 1), new Date(2030, 0, 1));
  assert.equal(creneaux.length, MAX_SLOTS);
});

test('une borne de fin antérieure au départ ne rend qu’un créneau', () => {
  const creneaux = slotSequence('day', new Date(2026, 7, 10), new Date(2026, 7, 1));
  assert.equal(creneaux.length, 0);
});

test('les granularités proposées suivent la longueur de la fenêtre', () => {
  assert.deepEqual(allowedBuckets(1), ['hour']);
  assert.deepEqual(allowedBuckets(7), ['hour', 'day']);
  assert.deepEqual(allowedBuckets(30), ['day', 'week']);
  assert.deepEqual(allowedBuckets(365), ['day', 'week', 'month']);
  // Jamais aucune : un écran sans un seul bouton se lit comme une panne.
  assert.ok(allowedBuckets(0).length >= 1);
});

test('la granularité par défaut donne un histogramme lisible', () => {
  for (const jours of [1, 7, 30, 90, 365, 1200]) {
    const b = defaultBucket(jours);
    assert.ok(allowedBuckets(jours).includes(b), `${jours} j : défaut hors des permises`);
  }
  assert.equal(defaultBucket(1), 'hour');
  assert.equal(defaultBucket(30), 'day');
  assert.equal(defaultBucket(365), 'month');
});

test('le haut de l’axe est un nombre rond, jamais en dessous du maximum', () => {
  for (const max of [0, 1, 3, 7, 12, 37, 99, 101, 1234]) {
    const haut = niceMax(max);
    assert.ok(haut >= max, `${max} dépasse son axe (${haut})`);
    assert.ok(Number.isInteger(haut), `${max} donne un axe non entier (${haut})`);
  }
  // Un seul visiteur ne doit pas remplir la hauteur du cadre.
  assert.equal(niceMax(1), 4);
  assert.equal(niceMax(37), 40);
});

test('les lignes de repère tombent sur des entiers', () => {
  for (const max of [1, 3, 7, 37, 250]) {
    for (const v of gridTicks(max)) {
      assert.ok(Number.isInteger(v), `repère non entier sur un axe à ${max}`);
      assert.ok(v <= niceMax(max));
    }
  }
  assert.deepEqual(gridTicks(4), [1, 2, 3, 4]);
});

test('les étiquettes de l’axe s’espacent au lieu de se chevaucher', () => {
  assert.equal(labelStep(10), 1);
  assert.equal(labelStep(24), 2);
  assert.equal(labelStep(168), 14);
  // Un axe vide ne doit pas rendre un pas de zéro : la boucle d'affichage
  // ferait alors une division par zéro à chaque barre.
  assert.equal(labelStep(0), 1);
});

test('les étiquettes courtes tiennent sous une barre', () => {
  const d = new Date(2026, 7, 7, 9, 0);
  assert.equal(shortLabel('hour', d), '09:00');
  assert.equal(shortLabel('day', d), '07/08');
  assert.equal(shortLabel('month', d), '08/26');
  for (const b of ['hour', 'day', 'week', 'month'] as const) {
    assert.ok(shortLabel(b, d).length <= 5, `étiquette ${b} trop longue`);
  }
});
