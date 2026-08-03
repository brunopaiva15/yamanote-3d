// CE QUI PASSE AU-DESSUS DU QUAI NE TRAVERSE PAS CE QU'ON Y MARCHE.
//
// Treize gares portent un plateau praticable à `ASCENT_FLOOR_Y`, au-dessus des
// voies. Le quai avait déjà des ouvrages à cette hauteur-là, posés bien avant
// qu'on puisse marcher au-dessus de lui : la dalle d'auvent de sept gares, la
// grande toiture d'acier des six hubs. Trois auvents et deux toitures
// traversaient réellement un plateau, et le joueur l'a rapporté d'un mot juste
// — « de très gros blocs gris foncé de partout » — à Shinagawa puis à Ueno.
//
// CE QUE CE FICHIER TIENT, c'est la décision, pas le dessin : `place.ceilAt`
// est la seule cote que quatre fichiers de rendu lisent (PlatformKit,
// PlatformSignage, OverheadSigns, PlatformAds, plus la charpente de Station),
// et `roofGap` celle que la halle lit. Si elles sont justes, rien ne pend au
// mauvais endroit ; si elles dérivent, tout dérive ensemble.
//
// Ce qui reste au-dessus d'elles — qu'un maillage soit bien là où la cote dit —
// se contrôle à la scène, par `scripts/station-inside.mjs`, qui interroge le
// rendu monté plutôt qu'une cote re-déduite.

import assert from 'node:assert/strict';
import test from 'node:test';
import { register } from 'node:module';

register('./fixtures/ts-resolve.mjs', import.meta.url);

const { STATION_COUNT } = await import('../src/data/loop.ts');
const { STATIONS } = await import('../src/data/stations.ts');
const { layoutFor } = await import('../src/data/stationLayouts.ts');
const { ASCENT_FLOOR_Y, PSD_X } = await import('../src/data/stationGeometry.ts');
const { shellsOf } = await import('../src/data/stationConcourseBuild.ts');
const { placementFor } = await import('../src/systems/stationPlacement.ts');
const { psdGates } = await import('../src/three/station/psdLayout.ts');
const { CANOPY_T, DECK_SLAB, deckHole, deckOver } =
  await import('../src/systems/stationDeck.ts');
const { ROOF_OVER, ROOF_UNDER, ROOF_W, roofGap } =
  await import('../src/systems/hubRoof.ts');

const GATES = psdGates();
const NAME = (i: number) => `${STATIONS[i].jy} ${STATIONS[i].romaji}`;
const ALL = [...Array(STATION_COUNT).keys()];

/** Les volumes praticables d'une gare, tels que le rendu les groupe. */
function halls(i: number) {
  return shellsOf(placementFor(i, GATES).network)
    .filter((s) => s.rooms.some((r) => r.walkable));
}

test('un plateau perce l’auvent exactement quand l’auvent le traverserait', () => {
  const pierced: string[] = [];
  for (const i of ALL) {
    const place = placementFor(i, GATES);
    const canopyY = layoutFor(i).canopyY;
    // La règle, énoncée sans passer par `deckOver` : y a-t-il un volume
    // praticable dont la tranche recouvre celle de la dalle d'auvent, dans
    // l'emprise du quai ?
    const conflict = halls(i).some(
      (s) => s.ceilY > canopyY
        && s.floorY - DECK_SLAB < canopyY + CANOPY_T
        && s.rect.x1 > PSD_X - 0.2
        && s.rect.x0 < PSD_X + layoutFor(i).depth + 0.2,
    );
    assert.equal(
      place.deck !== null,
      conflict,
      `${NAME(i)} : percée ${place.deck ? 'faite' : 'absente'}, conflit ${conflict}`,
    );
    if (place.deck) pierced.push(NAME(i));
  }
  // Trois, et elles se nomment : ce sont les seules dont l'auvent est posé
  // plus haut que le plancher d'un plateau (5,20, 5,40 et 6,00 contre 5,08).
  assert.deepEqual(pierced, ['JY05 Ueno', 'JY25 Shinagawa', 'JY26 Takanawa Gateway']);
  for (const i of ALL) {
    if (!placementFor(i, GATES).deck) continue;
    assert.ok(
      layoutFor(i).canopyY > ASCENT_FLOOR_Y,
      `${NAME(i)} : un auvent sous le plancher ne peut pas le traverser`,
    );
  }
});

test('sous un plateau, le plafond du quai passe sous son plancher', () => {
  for (const i of ALL) {
    const place = placementFor(i, GATES);
    const deck = place.deck;
    if (!deck) continue;
    // La sous-face du plateau : rien de ce qui pend au quai ne doit la
    // dépasser, sans quoi cela ressort du sol du hall.
    const soffit = deck.floorY - DECK_SLAB;
    // On échantillonne l'INTÉRIEUR : un ouvrage dont la tranche affleure le
    // bord du plateau sans le recouvrir n'est pas dessous, et suit l'auvent.
    for (let t = 1; t < 20; t++) {
      const z = deck.z0 + ((deck.z1 - deck.z0) * t) / 20;
      assert.ok(
        place.ceilAt(z) <= soffit + 1e-9,
        `${NAME(i)} : plafond ${place.ceilAt(z)} au-dessus de ${soffit} en z=${z}`,
      );
    }
    // Et l'emprise en z de ce qu'on accroche COMPTE : un caisson de huit
    // mètres à cheval sur le bord suit le plateau, sinon il en sort.
    assert.ok(place.ceilAt(deck.z0 - 3, 4) <= soffit + 1e-9);
    assert.ok(place.ceilAt(deck.z1 + 3, 4) <= soffit + 1e-9);
  }
});

test('hors du plateau, le plafond du quai est l’auvent, au centimètre près', () => {
  for (const i of ALL) {
    const place = placementFor(i, GATES);
    const canopyY = layoutFor(i).canopyY;
    const deck = place.deck;
    const half = layoutFor(i).length / 2;
    for (let t = 0; t <= 40; t++) {
      const z = -half + (2 * half * t) / 40;
      if (deck && z > deck.z0 - 0.01 && z < deck.z1 + 0.01) continue;
      assert.equal(
        place.ceilAt(z),
        canopyY,
        `${NAME(i)} : le plafond a bougé en z=${z}, hors de toute percée`,
      );
    }
  }
});

test('la percée reste dans le quai, et ne le coupe jamais en deux', () => {
  for (const i of ALL) {
    const place = placementFor(i, GATES);
    if (!place.deck) continue;
    const half = layoutFor(i).length / 2;
    const cut = deckHole(place.deck, half);
    assert.ok(cut, `${NAME(i)} : un plateau sans percée dessinable`);
    // Un trou qui affleure une arête ne se triangule pas : il reste de la
    // matière des deux côtés, et le quai garde ses deux bouts.
    assert.ok(cut.z0 > -half, `${NAME(i)} : la percée touche le bout sud`);
    assert.ok(cut.z1 < half, `${NAME(i)} : la percée touche le bout nord`);
    assert.ok(cut.z1 - cut.z0 < 2 * half - 4, `${NAME(i)} : la percée avale le quai`);
  }
});

test('la grande toiture des hubs s’interrompt sous un plateau, et seulement là', () => {
  for (const i of ALL) {
    const gap = roofGap(i);
    const conflict = halls(i).some(
      (s) => s.ceilY > ROOF_UNDER
        && s.floorY - DECK_SLAB < ROOF_OVER
        && s.rect.x1 > -ROOF_W / 2
        && s.rect.x0 < ROOF_W / 2,
    );
    assert.equal(gap !== null, conflict, `${NAME(i)} : percée de halle ${gap} / ${conflict}`);
    if (!gap) continue;
    // La percée couvre le plateau ENTIER : une ferme laissée au milieu du hall
    // est exactement le défaut qu'on corrige.
    for (const s of halls(i)) {
      if (s.ceilY <= ROOF_UNDER || s.floorY - DECK_SLAB >= ROOF_OVER) continue;
      if (s.rect.x1 <= -ROOF_W / 2 || s.rect.x0 >= ROOF_W / 2) continue;
      assert.ok(gap.z0 <= s.rect.z0 && gap.z1 >= s.rect.z1, `${NAME(i)} : percée trop courte`);
    }
  }
});

test('la percée de l’auvent et celle de la toiture décrivent le même plateau', () => {
  // Les deux se lisent sur le même réseau, à deux altitudes différentes. Là où
  // les deux existent, elles ne peuvent pas désigner deux endroits.
  for (const i of ALL) {
    const place = placementFor(i, GATES);
    const gap = roofGap(i);
    if (!place.deck || !gap) continue;
    assert.equal(place.deck.z0, gap.z0, `${NAME(i)} : deux percées, deux départs`);
    assert.equal(place.deck.z1, gap.z1, `${NAME(i)} : deux percées, deux fins`);
  }
});

test('un hall souterrain ne perce rien', () => {
  // Onze gares descendent sous les voies. Rien de ce qui est posé au-dessus du
  // quai ne les concerne, et une percée là-bas serait le signe que la tranche
  // d'altitude est mal lue.
  for (const i of ALL) {
    const net = placementFor(i, GATES).network;
    const under = shellsOf(net).filter((s) => s.rooms.some((r) => r.walkable) && s.ceilY < 0);
    if (!under.length) continue;
    const canopyY = layoutFor(i).canopyY;
    const only = deckOver(net, canopyY, canopyY + CANOPY_T, PSD_X - 0.2, PSD_X + 60);
    for (const s of under) {
      assert.ok(
        !only || s.rect.z0 > only.z1 || s.rect.z1 < only.z0 || only.floorY > 0,
        `${NAME(i)} : un volume souterrain compte comme plateau`,
      );
    }
  }
});

// --- L'AVERTISSEMENT QUE L'ON AFFICHE ------------------------------------
//
// Il n'a rien à voir avec les plateaux, et il est ici faute d'un meilleur
// endroit : c'est le seul fichier qui tienne ce que le RENDU dit d'une gare.
// Le jour où un troisième sujet s'y ajoute, il faudra le séparer.

test('l’avertissement de relevé ne s’affiche que là où il est vrai', async () => {
  const { profileConfidence } = await import('../src/data/stationConcourseWired.ts');
  const { readFileSync } = await import('node:fs');
  // Quatre gares, et quatre seulement : celles dont le document lu est ancien.
  const flagged = ALL.filter((i) => profileConfidence(i) === 'approximate');
  assert.deepEqual(flagged.map(NAME), [
    'JY04 Okachimachi', 'JY06 Uguisudani', 'JY08 Nishi-Nippori', 'JY09 Tabata',
  ]);
  for (const i of ALL) {
    assert.ok(profileConfidence(i), `${NAME(i)} : une gare branchée sans confiance`);
  }
  // ET L'INTERFACE LA LIT. Elle affichait « en construction » à toutes les
  // gares et sans condition, ce qui est devenu faux le jour où les trente sont
  // passées par leur relevé : un avertissement permanent n'avertit de rien.
  const notice = readFileSync(
    new URL('../src/ui/StationDevelopmentNotice.tsx', import.meta.url),
    'utf8',
  );
  assert.ok(notice.includes('profileConfidence'), 'l’avertissement ne lit pas le relevé');
  assert.ok(
    /profileConfidence\([^)]*\) !== 'approximate'\) return null/.test(notice),
    'l’avertissement s’affiche ailleurs que sur les quatre gares',
  );
  const strings = readFileSync(new URL('../src/i18n/strings.ts', import.meta.url), 'utf8');
  assert.ok(
    !/en cours de développement|under development|開発中/.test(strings),
    'le texte parle encore d’un chantier',
  );
});
