// L'interrupteur du prototype PLATEAU.
//
// Ces tests portent sur la seule chose qui décide de ce que voit un joueur en
// production. `src/systems/plateau.ts` n'a aucune dépendance - ni React, ni
// three, ni `import.meta.env` - donc Node l'exécute tel quel.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ENABLE_PLATEAU_PROTOTYPE,
  PLATEAU_ENTRY_STATION,
  PLATEAU_SEGMENT,
  plateauCoversSegment,
  plateauEnabled,
  plateauEntryStation,
  plateauRuntime,
} from '../src/systems/plateau.ts';

/** Simule une URL, le temps d'un test. `null` = pas de navigateur du tout. */
function withSearch(search: string | null, run: () => void): void {
  const globals = globalThis as unknown as { window?: unknown };
  const previous = globals.window;
  if (search === null) delete globals.window;
  else globals.window = { location: { search } };
  try {
    run();
  } finally {
    if (previous === undefined) delete globals.window;
    else globals.window = previous;
  }
}

test('le prototype est ÉTEINT par défaut', () => {
  // Tant que le monde est construit sur l'échantillon synthétique, l'afficher
  // par défaut ferait passer une ville inventée pour Tokyo. Ce test est là
  // pour qu'un `true` ne reparte pas en production par inadvertance : le jour
  // où le build tourne sur les vraies données PLATEAU, on le met à jour
  // sciemment, pas par accident.
  assert.equal(ENABLE_PLATEAU_PROTOTYPE, false);
  withSearch('', () => assert.equal(plateauEnabled(), false));
  withSearch('?other=1', () => assert.equal(plateauEnabled(), false));
  withSearch(null, () => assert.equal(plateauEnabled(), false));
});

test('?plateau=1 l’allume, ?plateau=0 l’éteint - l’URL a le dernier mot', () => {
  for (const on of ['?plateau=1', '?plateau=true', '?plateau=yes', '?plateau=']) {
    withSearch(on, () => assert.equal(plateauEnabled(), true, `${on} devrait allumer`));
  }
  for (const off of ['?plateau=0', '?plateau=false']) {
    withSearch(off, () => assert.equal(plateauEnabled(), false, `${off} devrait éteindre`));
  }
});

test('même allumé, le prototype ne couvre QUE son tronçon', () => {
  withSearch('?plateau=1', () => {
    assert.equal(plateauCoversSegment(PLATEAU_SEGMENT, 'inner'), true);
    for (let segment = 0; segment < 30; segment++) {
      if (segment === PLATEAU_SEGMENT) continue;
      assert.equal(
        plateauCoversSegment(segment, 'inner'),
        false,
        `le tronçon ${segment} ne devrait pas être couvert`,
      );
    }
  });
  // Éteint : aucun tronçon, pas même le sien.
  withSearch('', () => assert.equal(plateauCoversSegment(PLATEAU_SEGMENT, 'inner'), false));
});

test('le prototype couvre les deux sens sur son tronçon', () => {
  // La polyligne reste orientée 内回り ; en 外回り PlateauWorld la parcourt à
  // l'envers (progression 1 − t). Les deux sens sont donc couverts.
  withSearch('?plateau=1', () => {
    assert.equal(plateauCoversSegment(PLATEAU_SEGMENT, 'inner'), true);
    assert.equal(plateauCoversSegment(PLATEAU_SEGMENT, 'outer'), true);
  });
});

test('?plateau=1 fait aussi embarquer sur le tronçon', () => {
  // Sans cela le paramètre serait une promesse creuse : le tirage d'entrée
  // pose le joueur n'importe où, et il faudrait jusqu'à une heure de trajet
  // pour atteindre le tronçon couvert.
  withSearch('?plateau=1', () => assert.equal(plateauEntryStation(), PLATEAU_ENTRY_STATION));
  // Absent ou explicitement éteint : le boarding normal n'est pas touché.
  withSearch('', () => assert.equal(plateauEntryStation(), undefined));
  withSearch('?plateau=0', () => assert.equal(plateauEntryStation(), undefined));
  withSearch(null, () => assert.equal(plateauEntryStation(), undefined));
});

test('la gare d’embarquement est bien celle d’ARRIVÉE du tronçon', () => {
  // segmentAt(i, 'inner') = (i + 29) % 30 dans src/data/segments.ts : c'est la
  // gare d'arrivée qui désigne le tronçon parcouru pour l'atteindre.
  assert.equal((PLATEAU_ENTRY_STATION + 29) % 30, PLATEAU_SEGMENT);
  assert.ok(PLATEAU_ENTRY_STATION >= 0 && PLATEAU_ENTRY_STATION < 30);
});

test('l’état partagé démarre à zéro : personne ne change de branche', () => {
  assert.equal(plateauRuntime.coverage, 0);
  assert.equal(plateauRuntime.mounted, 0);
  assert.equal(plateauRuntime.distance, 0);
});
