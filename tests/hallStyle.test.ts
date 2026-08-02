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
  // Ces trois valeurs étaient des constantes de `three/station/Concourse`.
  // Elles sont maintenant dans une table ; elles doivent être les mêmes.
  const s = hallStyle('linear');
  assert.equal(s.lampPitch, 4.2, 'entraxe des réglettes');
  assert.equal(s.dadoH, 1.15, 'hauteur du soubassement');
  assert.equal(s.beamPitch, null, 'un souterrain n’a pas de poutres apparentes');
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

test('la liste des archétypes est fermée, et le reste retombe sur le linéaire', () => {
  assert.deepEqual([...HALL_ARCHETYPES].sort(), ['compact', 'linear', 'underViaduct']);
  // Les quatre autres formes du vocabulaire attendent la phase 15 : elles ne
  // se distinguent pas par leur couverture mais par leur HAUTEUR, et cela ne
  // tient pas dans une table. En attendant, elles ne cassent rien.
  for (const kind of ['cross', 'overbridge', 'mezzanine', 'hubSlice'] as const) {
    assert.deepEqual(hallStyle(kind), hallStyle('linear'), kind);
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
