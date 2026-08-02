// Les archétypes de hall (src/three/station/interiors/hallStyle).
//
// Trois halls qui ont la même forme, et ce qui les distingue n'est pas leur
// plan : c'est leur COUVERTURE. Un souterrain a une dalle ; le dessous d'un
// viaduc n'a pas de plafond du tout, il a les poutres du tablier ; un petit
// hall de gare locale est plus bas et plus nu.
//
// CE QUE CE TEST PROTÈGE, et c'est une seule chose mais elle est lourde :
// **`linear` ne bouge pas.** Les trente gares y passent tant qu'aucune n'est
// branchée sur son relevé, et une cote qui dériverait ici ferait bouger trente
// halls sans que personne ne l'ait demandé — sans erreur, sans test rouge, sans
// que rien ne le dise.

import test from 'node:test';
import assert from 'node:assert/strict';
import { HALL_ARCHETYPES, hallStyle } from '../src/three/station/interiors/hallStyle.ts';
import { compileProfile } from '../src/data/stationConcourseBuild.ts';
import { CONCOURSE_PROFILES } from '../src/data/stationConcourseProfiles.ts';
import { shellsOf } from '../src/data/stationConcourseBuild.ts';

test('LE HALL LINÉAIRE EST CELUI D’AVANT, AU CENTIMÈTRE', () => {
  // Ces valeurs étaient des constantes de `three/station/Concourse`. Elles sont
  // maintenant dans une table ; elles doivent être les mêmes.
  const s = hallStyle('linear');
  assert.equal(s.lampPitch, 4.2, 'entraxe des réglettes');
  assert.equal(s.dadoH, 1.15, 'hauteur du soubassement');
  assert.equal(s.beamPitch, null, 'un souterrain n’a pas de poutres apparentes');
  assert.equal(s.parapet, false, 'un souterrain a deux parois pleines');
  assert.equal(s.ceiling, true, 'et un plafond');
});

test('le dessous de viaduc montre son tablier, le hall compact non', () => {
  const via = hallStyle('underViaduct');
  assert.ok(via.beamPitch !== null, 'un dessous de viaduc sans poutres');
  assert.ok(via.beamPitch! < hallStyle('linear').lampPitch, 'poutres plus espacées que les lampes');
  assert.ok(via.beamDrop > 0.2, 'des poutres qui ne descendent pas ne se voient pas');

  const small = hallStyle('compact');
  assert.equal(small.beamPitch, null);
  // Ce qui caractérise un petit hall, c'est ce qu'il n'a pas : moins de lumière.
  assert.ok(small.lampPitch > hallStyle('linear').lampPitch);
});

test('la liste des archétypes est fermée : sept, et pas un de plus', () => {
  assert.deepEqual([...HALL_ARCHETYPES].sort(), [
    'compact', 'cross', 'hubSlice', 'linear', 'mezzanine', 'overbridge', 'underViaduct',
  ]);
});

test('UN PONT-CONCOURSE LAISSE VOIR LES VOIES, une mezzanine le hall', () => {
  // Ce n'est pas un parti de rendu, c'est un fait de relevé : « le
  // pont-concourse enjambe tout le faisceau : on voit les voies dessous ».
  // L'enfermer entre deux parois pleines lui retirerait ce pour quoi il existe.
  const bridge = hallStyle('overbridge');
  assert.equal(bridge.parapet, true);
  assert.ok(bridge.parapetH > 1 && bridge.parapetH < 1.3, 'un appui se tient à hauteur de main');
  assert.equal(bridge.ceiling, true, 'un pont-concourse est couvert');

  // La mezzanine s'ouvre dans l'autre sens : pas de plafond, on voit le hall
  // d'en dessous avant d'y descendre.
  const mezz = hallStyle('mezzanine');
  assert.equal(mezz.ceiling, false);
  assert.equal(mezz.parapet, true);

  // Et les trois halls de la phase 14 restent fermés des deux côtés.
  for (const kind of ['linear', 'underViaduct', 'compact'] as const) {
    assert.equal(hallStyle(kind).parapet, false, kind);
    assert.equal(hallStyle(kind).ceiling, true, kind);
  }
});

test('une grande gare a plus de hauteur entre ses lampes', () => {
  // Un volume plus grand ne se garnit pas plus serré : le hall transversal et
  // la tranche de grande gare espacent leur lumière, et montent leur
  // soubassement — c'est une gare, pas un couloir.
  for (const kind of ['cross', 'hubSlice'] as const) {
    assert.ok(hallStyle(kind).lampPitch > hallStyle('linear').lampPitch, kind);
    assert.ok(hallStyle(kind).dadoH > hallStyle('linear').dadoH, kind);
  }
});

test('chaque volume des trente relevés reçoit un style', () => {
  for (const p of CONCOURSE_PROFILES) {
    for (const shell of shellsOf(compileProfile(p))) {
      const s = hallStyle(shell.kind);
      assert.ok(s.lampPitch > 0 && s.dadoH > 0, `${p.stationIndex} ${shell.id}`);
    }
  }
});
