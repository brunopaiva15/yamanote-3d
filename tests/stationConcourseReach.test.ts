// Jusqu'où le décor s'écarte (src/data/stationConcourseReach + systems/stationOcclusion).
//
// C'EST LE VERROU DE TOUT LE CHANTIER, et il tient en une question : une gare
// a-t-elle le droit d'être plus large que son quai ? Le hall générique
// (`data/stationInterior`) répondait non — `x0 = PSD_X + 0,35`,
// `x1 = PSD_X + depth − 0,35` — parce qu'au-delà les nappes de sol reprennent
// leur place un mètre sous la dalle et couperaient le hall à hauteur d'épaule.
// Vingt-trois gares sur trente ont pourtant un ouvrage transversal.
//
// La réponse, mesurée ici, est en deux temps :
//
//   · CÔTÉ FOND DE QUAI, oui. La nappe de rue se dérobe déjà, et le décor long
//     s'écarte déjà d'une trentaine de mètres. Il ne manquait qu'une chose :
//     que quelqu'un vérifie. Quatre gares sur trente demandent plus que la
//     valeur générique, et de deux à six mètres.
//   · CÔTÉ VOIE, non, et jamais. Le ballast porte un train : il ne se dérobe
//     pas. Un couloir qui traverse le faisceau passe DESSOUS — six gares — et
//     `validateProfile` refuse désormais l'autre géométrie.
//
// D'où le fait que ce fichier protège avant tout : **à l'altitude des nappes de
// sol, les trente gares tiennent dans la bande du quai.** Le jour où ce ne sera
// plus vrai, un plancher gris repassera au milieu d'un hall.

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./fixtures/ts-resolve.mjs', import.meta.url);

const { deriveReach, reachFor } = await import('../src/data/stationConcourseReach.ts');
const { CONCOURSE_PROFILES, SUBTRACK_Y } = await import('../src/data/stationConcourseProfiles.ts');
const {
  atGroundSheet,
  BALLAST_KEEP_X,
  GROUND_SHEET_Y0,
  GROUND_SHEET_Y1,
  validateProfile,
} = await import('../src/data/stationConcourseTypes.ts');
const { PSD_X, RAIL_Y } = await import('../src/data/stationGeometry.ts');
const { layoutFor } = await import('../src/data/stationLayouts.ts');
const { STATIONS } = await import('../src/data/stations.ts');
const { STATION_COUNT } = await import('../src/data/loop.ts');
const occl = await import('../src/systems/stationOcclusion.ts');
const { runtime } = await import('../src/systems/runtime.ts');
const { useStore } = await import('../src/store.ts');

const NAME = (i: number) => `${STATIONS[i].jy} ${STATIONS[i].romaji}`;

test('la table dit la vérité sur les profils', () => {
  // LE GARDE-FOU DE LA TABLE. `stationConcourseReachTable` est générée
  // (`npm run data:reach`) pour que le décor n'embarque pas les cent trente kio
  // du dossier. Une table dérivée qui n'est pas vérifiée est une table qui
  // finira par mentir : on recalcule donc les trente portées depuis les profils,
  // et on exige l'égalité au centième.
  for (let i = 0; i < STATION_COUNT; i++) {
    const want = deriveReach(CONCOURSE_PROFILES[i]);
    const got = reachFor(i);
    for (const k of ['built', 'shown', 'groundNear', 'groundFar'] as const) {
      assert.ok(
        Math.abs(want[k] - got[k]) < 5e-3,
        `${NAME(i)} : ${k} vaut ${got[k]} dans la table, ${want[k]} dans le profil `
          + '— relancer `npm run data:reach`',
      );
    }
  }
});

/**
 * La table est écrite au millimètre (`toFixed(3)`) : on ne compare donc jamais
 * ses cotes au flottant près, mais au demi-centimètre. C'est très en deçà de
 * tout ce qui se voit, et très au-delà de ce qui se calcule.
 */
const EPS = 5e-3;

test('la portée ne rétrécit jamais sous la bande du quai', () => {
  // Une petite gare dont tout le hall tient dans le quai ne doit pas faire
  // RENTRER le décor : la portée est un plancher, pas une mesure.
  for (let i = 0; i < STATION_COUNT; i++) {
    const r = reachFor(i);
    const back = PSD_X + layoutFor(i).depth;
    assert.ok(r.built >= back - EPS, `${NAME(i)} : portée bâtie sous le fond de quai`);
    assert.ok(r.shown >= r.built - EPS, `${NAME(i)} : montré plus court que bâti`);
    assert.ok(r.groundFar >= back - EPS, NAME(i));
    assert.ok(r.groundNear <= PSD_X + EPS, NAME(i));
  }
  // La boucle se replie.
  assert.deepEqual(reachFor(30), reachFor(0));
  assert.deepEqual(reachFor(-1), reachFor(29));
});

test('AU RAS DU SOL, les trente gares tiennent dans la bande du quai', () => {
  // LE TEST QUI COMPTE. Rien de ce qui vit à l'altitude du ballast et de la rue
  // ne sort de ce que le décor dégage déjà. C'est ce qui rend la phase 6 sans
  // risque : le sol n'a rien de nouveau à faire.
  for (let i = 0; i < STATION_COUNT; i++) {
    const r = reachFor(i);
    const back = PSD_X + layoutFor(i).depth;
    assert.ok(
      Math.abs(r.groundNear - PSD_X) < EPS,
      `${NAME(i)} : quelque chose franchit la voie au ras du sol (${r.groundNear})`,
    );
    assert.ok(
      Math.abs(r.groundFar - back) < EPS,
      `${NAME(i)} : quelque chose déborde au ras du sol (${r.groundFar} > ${back})`,
    );
  }
});

test('la bande d’altitude des nappes encadre bien le rail', () => {
  // Si quelqu'un déplace `RAIL_Y` sans toucher à la bande, la règle cesserait
  // de mordre en silence.
  assert.ok(GROUND_SHEET_Y0 < RAIL_Y && RAIL_Y < GROUND_SHEET_Y1);
  assert.equal(BALLAST_KEEP_X, PSD_X - 0.1);
  // Un niveau de hall ordinaire (sol −3,675, plafond −0,48) coupe la bande ;
  // un niveau sous-voie ne la coupe pas. C'est toute la raison du second.
  assert.equal(atGroundSheet({ floorY: -3.675, headroom: 3.195 }), true);
  assert.equal(atGroundSheet({ floorY: -6.4, headroom: 3.2 }), false);
  assert.equal(atGroundSheet({ floorY: 5.075, headroom: 3.1 }), false);
});

test('SIX gares passent sous la voie, et la liste est fermée', () => {
  // Ce sont les six dont un hall traverse réellement le faisceau. Elles ne
  // peuvent pas tenir à la cote du hall ordinaire : son plafond est
  // soixante-sept centimètres AU-DESSUS du ballast.
  const sub: string[] = [];
  for (const p of CONCOURSE_PROFILES) {
    if (p.levels.some((l) => l.floorY === SUBTRACK_Y)) sub.push(NAME(p.stationIndex));
  }
  assert.deepEqual(sub, [
    'JY01 Tokyo',
    'JY06 Uguisudani',
    'JY13 Ikebukuro',
    'JY17 Shinjuku',
    'JY19 Harajuku',
    'JY20 Shibuya',
  ]);
  // Et chacune le DIT : la volée dessinée aujourd'hui n'y descend pas.
  for (const p of CONCOURSE_PROFILES) {
    if (!sub.includes(NAME(p.stationIndex))) continue;
    assert.ok(
      p.openQuestions?.some((q) => q.includes('SOUS LA VOIE')),
      `${NAME(p.stationIndex)} : passe sous la voie sans le dire`,
    );
  }
});

test('le validateur refuse un hall qui traverse le ballast', () => {
  // On casse une gare saine d'une seule façon : on remonte son couloir
  // sous-voie à la cote du hall ordinaire. Rien d'autre ne change.
  const uguisudani = CONCOURSE_PROFILES[5];
  assert.deepEqual(validateProfile(uguisudani), []);
  const broken = {
    ...uguisudani,
    levels: uguisudani.levels.map((l) =>
      l.id === 'sub' ? { ...l, floorY: -3.675, headroom: 3.195 } : l),
  };
  const issues = validateProfile(broken);
  assert.ok(
    issues.some((it) => it.code === 'acrossBallast' && it.where === 'passage-north'),
    `attendu acrossBallast, obtenu : ${issues.map((it) => it.code).join(', ') || 'rien'}`,
  );
});

// --- Ce que le décor en fait ---------------------------------------------

/** Place le joueur à quai dans la gare `i` et remet l'occultation à jour. */
function atStation(i: number): void {
  useStore.setState({ index: i, platformIndex: i });
  runtime.platformFade = 1;
  runtime.platformSlide = 0;
  occl.updateStationOcclusion();
}

test('le décor long s’écarte de ce que la gare BÂTIT', () => {
  for (let i = 0; i < STATION_COUNT; i++) {
    atStation(i);
    const r = reachFor(i);
    // Le plan long le plus proche est à 5,2 m au repos : une fois écarté, il
    // doit se trouver au-delà du fond de la gare.
    const plane = 5.2 + occl.sidePush(occl.stationOcclusion.side);
    assert.ok(
      plane > r.built,
      `${NAME(i)} : plan de décor à ${plane.toFixed(1)} m, la gare bâtit jusqu’à ${r.built.toFixed(1)} m`,
    );
  }
});

test('QUATRE gares seulement écartent le décor plus loin qu’avant', () => {
  // La valeur générique (profondeur + 24 m, + 22 sur faisceau ouvert) couvrait
  // déjà vingt-six gares sur trente. Personne ne l'avait vérifié ; c'est fait,
  // et le correctif ne touche que les quatre où elle était trop juste.
  const wider: string[] = [];
  for (let i = 0; i < STATION_COUNT; i++) {
    const l = layoutFor(i);
    const generic = l.depth + (l.config !== 'side' ? 24 : 18) + (l.openFarSide ? 22 : 0);
    atStation(i);
    if (occl.stationOcclusion.push > generic + 1e-9) wider.push(NAME(i));
  }
  assert.deepEqual(wider, [
    'JY01 Tokyo',
    'JY17 Shinjuku',
    'JY26 Takanawa Gateway',
    'JY27 Tamachi',
  ]);
});

test('la nappe de rue se range derrière l’emprise au ras du sol', () => {
  for (let i = 0; i < STATION_COUNT; i++) {
    atStation(i);
    const r = reachFor(i);
    // `groundPush` déplace la rive intérieure de la nappe, posée en 5 m.
    const edge = 5 + occl.groundPush(occl.stationOcclusion.side, 5);
    assert.ok(edge >= r.groundFar - EPS, `${NAME(i)} : la rue rentre dans la gare`);
    // Et elle ne recule pas plus que nécessaire : aucune gare n'ouvre
    // aujourd'hui un vide au-delà de son quai.
    assert.ok(edge <= PSD_X + layoutFor(i).depth + 0.6, `${NAME(i)} : la rue recule pour rien`);
  }
});

test('le ballast, lui, ne recule pas — sa rive s’arrête au bord de quai', () => {
  // La seule des trois nappes qui ne suive PAS l'emprise, et la raison est
  // physique : un train roule dessus.
  for (let i = 0; i < STATION_COUNT; i++) {
    atStation(i);
    const edge = 5 - occl.ballastTrim(occl.stationOcclusion.side, 5);
    assert.ok(
      Math.abs(edge - BALLAST_KEEP_X) < EPS,
      `${NAME(i)} : rive de ballast à ${edge}, attendu ${BALLAST_KEEP_X}`,
    );
  }
});

test('un repère de quartier ne suit pas l’emprise : on le REGARDE depuis la gare', () => {
  // Le tram d'Ōtsuka et la poutre de monorail de Hamamatsuchō doivent rester
  // lisibles depuis le quai. Les ranger derrière une passerelle de trente
  // mètres serait le contraire de leur raison d'être — d'où `outer`, qui suit
  // le bâti de la GARE et non celui du profil.
  atStation(27); // JY28 Hamamatsuchō : passerelle à 34 m, monorail à 19 m.
  const r = reachFor(27);
  const beam = 8 + occl.landmarkPush(occl.stationOcclusion.side, 8);
  assert.ok(beam < r.built, 'le monorail a été rangé derrière la passerelle');
  assert.ok(beam > PSD_X + layoutFor(27).depth, 'le monorail est planté dans le quai');
});
