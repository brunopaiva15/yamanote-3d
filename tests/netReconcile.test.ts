// Le fichier qui garantit qu'aucun carillon ne se rejoue.
//
// C'est le test le plus important du multijoueur, et il tient à un détail qui
// n'a rien de réseau : dans ce jeu, la machine à états du train PILOTE LE SON.
// L'annonce d'approche, le carillon des portes, la 発車メロディ, l'annonce de
// fermeture - tout est déclenché par `once(clé, condition, fn)` dans
// systems/stationCycle, c'est-à-dire par le franchissement d'un seuil de
// `runtime.phaseT`.
//
// Reculer `phaseT` de trois dixièmes de seconde remet donc un de ces seuils
// DEVANT nous, et le carillon se rejoue. Dans une rame où l'on n'a rien d'autre
// à faire qu'écouter, c'est la chose la plus visible qu'on puisse casser - et
// c'est très exactement ce qu'un rattrapage réseau naïf ferait dix fois par
// minute.
//
// D'où la règle que ce fichier fige : quand on est en avance, on ne recule pas,
// on RALENTIT. Et jamais sous un seuil déjà franchi.

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./fixtures/ts-resolve.mjs', import.meta.url);

const { DEAD_ZONE_S, SOFT_MAX_S, WARP_MAX, WARP_MIN, reconcile, warpDt } = await import(
  '../src/systems/net/reconcile.ts'
);

type CycleState = Parameters<typeof reconcile>[0];

function etat(over: Partial<CycleState> = {}): CycleState {
  return { phase: 'dwell', phaseT: 10, index: 5, stopSequence: 3, ...over };
}

// --- Ce qui n'est pas un écart de temps -----------------------------------

test('une phase différente n’est pas une dérive : c’est un autre monde', () => {
  const c = reconcile(etat(), etat({ phase: 'cruise' }), 0);
  assert.equal(c.kind, 'hard');
});

test('une gare différente force la resynchronisation', () => {
  assert.equal(reconcile(etat(), etat({ index: 6 }), 0).kind, 'hard');
});

test('un arrêt différent force la resynchronisation', () => {
  // Sans cette garde, un suiveur en retard d'un arrêt entier se croirait à
  // deux secondes près de l'hôte et n'aurait jamais l'occasion de recoller.
  assert.equal(reconcile(etat(), etat({ stopSequence: 4 }), 0).kind, 'hard');
});

// --- Le régime normal -----------------------------------------------------

test('un écart minuscule ne déclenche rien', () => {
  const c = reconcile(etat({ phaseT: 10 }), etat({ phaseT: 10 + DEAD_ZONE_S / 2 }), 0);
  assert.equal(c.kind, 'none');
});

test('un retard modéré accélère l’horloge locale, sans excès', () => {
  const c = reconcile(etat({ phaseT: 10 }), etat({ phaseT: 10.6 }), 0);
  assert.equal(c.kind, 'hard' === c.kind ? 'hard' : 'warp');
  assert.equal(c.kind, 'warp');
  if (c.kind !== 'warp') return;
  assert.ok(c.rate > 1, 'on est en retard : il faut presser le pas');
  assert.ok(c.rate <= WARP_MAX, `taux ${c.rate} au-dessus du plafond`);
});

test('une avance modérée ralentit l’horloge locale, sans excès', () => {
  const c = reconcile(etat({ phaseT: 10.6 }), etat({ phaseT: 10 }), 0);
  assert.equal(c.kind, 'warp');
  if (c.kind !== 'warp') return;
  assert.ok(c.rate < 1, 'on est en avance : il faut lever le pied');
  assert.ok(c.rate >= WARP_MIN, `taux ${c.rate} sous le plancher`);
});

test('le taux reste dans ses bornes quel que soit l’écart admissible', () => {
  for (let d = -SOFT_MAX_S; d <= SOFT_MAX_S; d += 0.05) {
    const c = reconcile(etat({ phaseT: 10 }), etat({ phaseT: 10 + d }), 0);
    if (c.kind !== 'warp') continue;
    assert.ok(
      c.rate >= WARP_MIN && c.rate <= WARP_MAX,
      `écart ${d.toFixed(2)} s → taux ${c.rate}`,
    );
  }
});

test('au-delà d’une seconde et demie, on renonce à rattraper en douceur', () => {
  assert.equal(reconcile(etat({ phaseT: 10 }), etat({ phaseT: 12 }), 0).kind, 'hard');
  assert.equal(reconcile(etat({ phaseT: 12 }), etat({ phaseT: 10 }), 0).kind, 'hard');
});

// --- LA règle -------------------------------------------------------------

test('AUCUNE correction ne fait jamais reculer l’horloge locale', () => {
  // La formulation est volontairement large : on balaie tous les écarts
  // admissibles, toutes les positions de seuil, et l'on vérifie qu'après
  // application d'un pas de temps, `phaseT` a AVANCÉ. C'est l'invariant dont
  // dépend « aucun son ne se rejoue », et il ne doit tenir à aucune hypothèse
  // sur la façon dont le taux est calculé.
  const dt = 1 / 60;
  for (let d = -SOFT_MAX_S; d <= SOFT_MAX_S; d += 0.03) {
    for (const fired of [0, 5, 9.9, 10, 10.5]) {
      const local = etat({ phaseT: 10 });
      const c = reconcile(local, etat({ phaseT: 10 + d }), fired);
      if (c.kind === 'hard') continue;
      const apres = local.phaseT + warpDt(dt, c);
      assert.ok(
        apres > local.phaseT,
        `écart ${d.toFixed(2)}, seuil ${fired} : ${apres} <= ${local.phaseT}`,
      );
    }
  }
});

test('sous un seuil déjà franchi, on ne ralentit pas davantage', () => {
  // Cas dégénéré : une resynchronisation mal ordonnée nous a laissés en deçà
  // du dernier événement tiré. Ralentir encore nous y maintiendrait ; on laisse
  // le temps avancer normalement, le temps de repasser au-dessus.
  const c = reconcile(etat({ phaseT: 9 }), etat({ phaseT: 8.5 }), 9.5);
  assert.equal(c.kind, 'none');
  assert.equal(warpDt(0.016, c), 0.016);
});

test('au-dessus du dernier seuil, le ralentissement s’applique normalement', () => {
  const c = reconcile(etat({ phaseT: 10 }), etat({ phaseT: 9.5 }), 9);
  assert.equal(c.kind, 'warp');
});

// --- Application ----------------------------------------------------------

test('warpDt ne touche au pas de temps que pour un « warp »', () => {
  assert.equal(warpDt(0.016, { kind: 'none' }), 0.016);
  assert.equal(warpDt(0.016, { kind: 'hard' }), 0.016);
  assert.equal(warpDt(0.016, { kind: 'warp', rate: 1.1 }), 0.016 * 1.1);
});

test('un retard d’une seconde se résorbe en une quinzaine de secondes', () => {
  // Simulation grossière : on applique la correction image par image et l'on
  // regarde en combien de temps l'écart passe sous la zone morte. C'est la
  // vérification qu'on n'a pas réglé un rattrapage si lent qu'il ne rattrape
  // jamais, ni si brutal qu'il s'entende.
  const dt = 1 / 60;
  let local = 10;
  let hote = 11;
  let ecoule = 0;
  for (let i = 0; i < 60 * 40; i++) {
    const c = reconcile(
      etat({ phaseT: local }),
      etat({ phaseT: hote }),
      0,
    );
    local += warpDt(dt, c);
    hote += dt;
    ecoule += dt;
    if (Math.abs(hote - local) < DEAD_ZONE_S) break;
  }
  assert.ok(Math.abs(hote - local) < DEAD_ZONE_S, 'l’écart ne se résorbe pas');
  assert.ok(ecoule < 20, `il a fallu ${ecoule.toFixed(1)} s, c'est trop long`);
});
