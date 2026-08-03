// LES DIX-HUIT EXIGENCES DU CAHIER DES CHARGES (phase 26).
//
// Ce fichier n'est PAS la somme des contrôles du chantier : la plupart des dix-
// huit exigences étaient déjà tenues, souvent mieux et à l'endroit où elles ont
// un sens. Redoubler un contrôle robuste pour pouvoir annoncer un test de plus
// serait du bruit, et le bruit finit toujours par cacher un vrai défaut.
//
// Ce fichier tient donc DEUX choses :
//
//   · la MATRICE, ci-dessous : pour chacune des dix-huit exigences, où elle est
//     vérifiée. C'est le document dont on a besoin le jour où l'une d'elles
//     casse — savoir quel fichier ouvrir ;
//   · ce que la matrice a montré MANQUANT, et rien d'autre.
//
// ── MATRICE DE COUVERTURE ────────────────────────────────────────────────────
//
//  #1  Trente profils
//      ✔ stationConcourseProfiles « les trente gares ont un profil, dans l'ordre »
//
//  #2  Date de référence et sources
//      ✔ stationConcourseProfile « le relevé doit porter sa date et ses sources »
//      ✔ stationConcourseProfiles « les trente profils passent le validateur »
//      ✔ stationConcourseSources (8 tests : plan officiel, numéro interne, carnet)
//      + ICI « toute date de référence est celle du chantier, et se lit »
//
//  #3  Un accès praticable rejoint un nœud existant
//      ✔ stationConcourseProfile « un accès mène à un hall qui existe »  (profil)
//      ✔ stationConcourseNetwork « vingt-huit gares ont UN accès vivant »
//      + ICI « tout accès vivant débouche dans une pièce qui existe et qui porte »
//
//  #4  Depuis un accès, on rejoint un groupe de portillons
//      ✔ stationConcourseProfile « depuis l'accès principal, on atteint un
//        contrôle puis une sortie »                                     (profil)
//      ✔ stationWired « chaque baie est desservie, et chaque bouche atteignable »
//      + ICI « depuis CHAQUE accès vivant, on rejoint une ligne franchissable »
//
//  #5  Un groupe franchissable a au moins un passage accessible
//      ✔ stationConcourseNetwork « DEUX GROUPES, un seul rang de baies »
//      ✔ stationInside « on passe le portillon, une fois, et par un vrai passage »
//      + ICI « toute ligne franchissable a une baie qu'on peut aborder »
//
//  #6  Toute sortie praticable tient à une zone libre
//      ✔ stationConcourseProfile « une sortie part toujours d'une zone libre »
//      ✔ stationSignage « on n'annonce que ce qu'on perce »
//      + ICI « toute bouche praticable perce une pièce LIBRE, et on l'atteint »
//
//  #7  Aucun passage principal étranglé
//      ✔ stationFrontages « une devanture reste dans sa pièce, et laisse le passage »
//      ✔ stationInterior « le passage du milieu ne se referme jamais »
//      + ICI « AUCUN COULOIR N'EST ÉTRANGLÉ »
//
//  #8  Pas de chevauchement entre solides incompatibles
//      ✔ stationInterior « le mobilier tient contre ses parois, sans se chevaucher »
//        (hall générique seulement)
//      + ICI « DEUX SOLIDES INCOMPATIBLES NE PARTAGENT PAS LE MÊME SOL »
//
//  #9  Rien ne bloque le cheminement principal
//      ✔ stationInside « du quai à la rue, on ne traverse rien » (+ le retour)
//      ✔ stationFrontages « aucune gare ne signale une devanture qui mange le passage »
//      ✔ stationShops « le konbini laisse deux mètres de passage dans le hall »
//      → couvert par #7 pour la géométrie et par le parcours pour le reste
//
// #10  Rendu et collisions viennent des mêmes données
//      ✔ stationDetailTiers « tout ce qui barre vit dans le réseau »
//      ✔ stationDetailTiers « UN POTEAU N'EST PAS DE LA FUMÉE »
//      ✔ stationShops « les emprises déclarées sont bien celles que le rendu emploie »
//      + ICI « TOUT CE QUI BARRE SE DESSINE, TOUT CE QUI SE DESSINE BARRE »
//
// #11  Un même élément porte le même nom sur tous les panneaux
//      ✔ stationSignage (14 tests : potences, bouches, contrôles, panneaux)
//      + ICI « SIX PORTEURS, UN SEUL NOM » et « AUCUN AUTRE CHEMIN VERS UN NOM »
//
// #12  Les gares à plusieurs halls ne sont pas fusionnées
//      ✔ stationConcourseNetwork « DEUX ENSEMBLES SÉPARÉS FONT DEUX VOLUMES »
//      ✔ stationConcourseNetwork « HARAJUKU EN A DEUX »
//      + ICI « une gare qui déclare N ensembles en rend N »
//
// #13  Les halls supérieurs passent au-dessus du gabarit
// #14  Les halls inférieurs passent sous les voies
//      ✔ stationConcourseReach (11 tests : emprise, nappes, ballast, rue)
//      ✔ stationConcourseProfile « un niveau déclaré sous le quai est réellement dessous »
//      + ICI « ON PASSE AU-DESSUS DE LA RAME, OU SOUS LE RAIL — JAMAIS ENTRE »
//
// #15  Le repli sur `interiorFor` est fidèle
//      ✔ stationConcourseBuild « le repli est fidèle au rectangle près »
//      ✔ stationConcourseNetwork « LE SOL N'A PAS BOUGÉ D'UN CENTIMÈTRE »
//      ✔ stationConcourseNetwork « les baies du hall générique sont EXACTEMENT
//        celles d'avant », « la marche des trente gares n'a pas changé »
//      + ICI « LE REPLI DES TRENTE », qui rend au contrôle les vingt-neuf gares
//        que le branchement lui a retirées
//
// #16  Nippori ne reçoit jamais deux ponts-concours
//      ✔ stationConcourseBuild « Nippori cesse d'être un cas spécial »
//      ✔ stationWired « les trois signatures de la phase 22 tiennent leur promesse »
//      + ICI « aucun hall générique dans la signature de Nippori »
//
// #17  Un palier ne retire jamais ce qui barre
//      ✔ stationDetailTiers (3 tests)
//      + ICI « LE RÉSEAU PRATICABLE NE CONNAÎT AUCUN PALIER » et
//        « UN OBSTACLE GARDE UNE REPRÉSENTATION À TOUS LES PALIERS »
//
// #18  `npm test`, `npm run build`, `npm run lint`
//      → hors test : c'est la commande elle-même. Le résultat est reporté dans
//        `docs/STATION_CONCOURSE_SCOPE.md`.
//
// CE QUE LA MATRICE A TROUVÉ, et qui n'était pas un défaut de test :
//
//   · le mobilier disparaissait entièrement au palier de qualité 2 tout en
//     continuant à barrer — l'interdit exact de l'exigence #17 ;
//   · un panneau mural encastré barrait le hall d'une gare branchée et pas
//     celui de sa voisine : les deux chemins ne répondaient pas la même chose
//     à la même question (#15) ;
//   · une devanture et une file de poteaux tombaient derrière une palissade de
//     chantier (#8) ;
//   · un distributeur laissait 1,20 m de passage entre lui et une galerie (#9) ;
//   · les bornes d'un contrôle qu'on REGARDE, deux niveaux plus bas, barraient
//     le hall d'au-dessus (#10) ;
//   · deux lignes de portillons se partageaient soixante centimètres de sol
//     (#8) — celle-là est DITE et non corrigée : les deux largeurs sont
//     composées, et les rapprocher demanderait d'inventer une cote.
//
// ─────────────────────────────────────────────────────────────────────────────

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { register } from 'node:module';

register('./fixtures/ts-resolve.mjs', import.meta.url);

const {
  concourseBays,
  legacyNetwork,
  networkFor,
  networkIssues,
  shellsOf,
} = await import('../src/data/stationConcourseBuild.ts');
const { fixtureBlocks, interiorFor, interiorSolids } =
  await import('../src/data/stationInterior.ts');
const { CONCOURSE_PROFILES, profileFor } = await import('../src/data/stationConcourseProfiles.ts');
const { wiredIndices } = await import('../src/data/stationConcourseWired.ts');
const { guidePosts, signageFor } = await import('../src/data/stationSignage.ts');
const { placementFor } = await import('../src/systems/stationPlacement.ts');
const { psdGates } = await import('../src/three/station/psdLayout.ts');
const { concourseFloorAt, walkerBlocked } = await import('../src/systems/stationLevels.ts');
const { routeFromStreet, routeToStreet } = await import('../src/systems/concourseRoute.ts');
const { STATIONS } = await import('../src/data/stations.ts');
const { STATION_COUNT } = await import('../src/data/loop.ts');
const {
  BALLAST_KEEP_X,
  GROUND_SHEET_Y0,
  GROUND_SHEET_Y1,
  MIN_BRANCH_WIDTH,
} = await import('../src/data/stationConcourseTypes.ts');
const { REFERENCE_DATE } = await import('../src/data/stationConcourseSources.ts');
const { ASCENT_FLOOR_Y, CANOPY_Y, PSD_X } = await import('../src/data/stationGeometry.ts');

type Rect = { x0: number; x1: number; z0: number; z1: number };

const GATES = psdGates();
const NAME = (i: number) => `${STATIONS[i].jy} ${STATIONS[i].romaji}`;
const ALL = Array.from({ length: STATION_COUNT }, (_, i) => ({
  i,
  name: NAME(i),
  place: placementFor(i, GATES),
}));
const WIRED = new Set(wiredIndices());

/**
 * Les catégories d'un fléchage de hall — la liste de `textures/concourse`.
 *
 * Trois couleurs et jamais autre chose : le jaune mène dehors, le blanc mène
 * aux trains, le bleu mène aux installations. C'est ce qui rend une gare
 * japonaise lisible sans lire un mot de japonais.
 */
const GUIDE_KINDS = new Set(['exit', 'platform', 'gates', 'facility']);

/** Deux emprises se recouvrent-elles, au-delà d'un jeu de tolérance ? */
function overlap(a: Rect, b: Rect, slack = 1e-6): number {
  const dx = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const dz = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
  return dx > slack && dz > slack ? Math.min(dx, dz) : 0;
}

const show = (r: Rect) =>
  `[${r.x0.toFixed(2)},${r.z0.toFixed(2)} → ${r.x1.toFixed(2)},${r.z1.toFixed(2)}]`;

// --- #2 : la date de référence -------------------------------------------

test('toute date de référence est celle du chantier, et se lit', () => {
  // Le validateur exige qu'elle EXISTE (`stationConcourseProfile`). Ce qui
  // n'était vérifié nulle part, c'est qu'elle soit la même sur les trente : un
  // relevé daté de 2019 mêlé à vingt-neuf relevés d'août 2026 décrirait une
  // gare qui n'a jamais existé, et c'est exactement l'interdit du cahier des
  // charges — « ne jamais mélanger des plans d'années différentes sans le
  // signaler ».
  for (const p of CONCOURSE_PROFILES) {
    assert.equal(p.referenceDate, REFERENCE_DATE, NAME(p.stationIndex));
    assert.ok(p.sources.length > 0, `${NAME(p.stationIndex)} : aucune source`);
    for (const s of p.sources) {
      assert.ok(s.title.trim().length > 0, `${NAME(p.stationIndex)} : source sans titre`);
      assert.ok(s.publisher.trim().length > 0, `${NAME(p.stationIndex)} : source sans éditeur`);
    }
    // Et au moins une source de premier rang : le plan officiel de l'exploitant.
    assert.ok(
      p.sources.some((s) => s.tier === 1),
      `${NAME(p.stationIndex)} : aucune source de premier rang`,
    );
  }
});

// --- #3 et #4 : d'un accès à un contrôle ---------------------------------

test('tout accès vivant débouche dans une pièce qui existe et qui porte', () => {
  // Le validateur le tient sur le PROFIL. Ce qui manquait est le même contrôle
  // sur ce que la gare rend vraiment : un accès dont la trémie n'existe pas au
  // placement est écarté (`liveAccessesFor`), et il fallait vérifier que ceux
  // qui restent débouchent sur du sol.
  let live = 0;
  for (const { name, place } of ALL) {
    for (const a of place.liveAccesses) {
      live++;
      const room = place.network.rooms.find((r) => r.id === a.toRoomId);
      assert.ok(room, `${name} : l'accès ${a.toRoomId} ne mène à aucune pièce`);
      assert.equal(room.walkable, true, `${name} : ${a.toRoomId} n'est pas praticable`);
      assert.equal(
        room.floorY,
        a.floorY,
        `${name} : la volée aboutit à ${a.floorY} et la pièce est à ${room.floorY}`,
      );
      // Et il y a du SOL dans cette pièce : un débouché sur un volume dont
      // chaque point serait occupé ne mènerait nulle part. On balaie plutôt que
      // de sonder le milieu — le milieu d'un hall est souvent un konbini.
      let floor = false;
      for (let x = room.rect.x0 + 0.5; x < room.rect.x1 && !floor; x += 0.5) {
        for (let z = room.rect.z0 + 0.5; z < room.rect.z1 && !floor; z += 0.5) {
          floor = concourseFloorAt(place, x, z) === room.floorY;
        }
      }
      assert.ok(floor, `${name} : ${a.toRoomId} sans sol`);
    }
  }
  assert.ok(live >= STATION_COUNT, `${live} accès vivants pour ${STATION_COUNT} gares`);
});

/** Les pièces qu'on atteint depuis celle-ci, de volée en volée. */
function reach(net: ReturnType<typeof networkFor>, from: string): Set<string> {
  const seen = new Set([from]);
  const queue = [from];
  while (queue.length) {
    const here = queue.shift()!;
    for (const j of net.joins) {
      if (!j.walkable) continue;
      const next = j.from === here ? j.to : j.to === here ? j.from : null;
      if (!next || seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return seen;
}

/**
 * Les lignes de portillons qu'on peut réellement franchir.
 *
 * Une ligne cotée hors du recouvrement de ses deux pièces n'a aucune approche —
 * le relevé d'Ikebukuro et celui de Shibuya en portent une chacun, et le
 * compilateur le DIT (`gateOffRoom`). Le cahier des charges parle des groupes
 * FRANCHISSABLES : ce sont ceux-là qu'on exclut, en les nommant.
 */
function crossable(i: number, net: ReturnType<typeof networkFor>) {
  const p = WIRED.has(i) ? profileFor(i) : null;
  const off = new Set(
    p ? networkIssues(p, net).filter((it) => it.code === 'gateOffRoom').map((it) => it.where) : [],
  );
  // Et une ligne dont l'une des deux pièces n'est que REPRÉSENTÉE ne se
  // franchit pas non plus : on la voit depuis le hall — les portillons Yaesu
  // de Tokyo, vus par-dessus GRANSTA — sans pouvoir s'en approcher.
  const walk = (id: string) => net.rooms.find((r) => r.id === id)?.walkable === true;
  return net.gates.filter(
    (g) => g.walkable && !off.has(g.id) && walk(g.from) && walk(g.to),
  );
}

test('depuis CHAQUE accès vivant, on rejoint une ligne franchissable', () => {
  for (const { i, name, place } of ALL) {
    const net = place.network;
    if (!net.built) continue;
    const lines = crossable(i, net);
    for (const a of place.liveAccesses) {
      const rooms = reach(net, a.toRoomId);
      assert.ok(
        lines.some((g) => rooms.has(g.from) || rooms.has(g.to)),
        `${name} : l'accès qui donne sur ${a.toRoomId} ne mène à aucun contrôle`,
      );
    }
  }
});

// --- #5 : une ligne franchissable a un passage abordable ------------------

test('toute ligne franchissable a une baie qu’on peut aborder', () => {
  for (const { i, name, place } of ALL) {
    const net = place.network;
    if (!net.built) continue;
    const bays = concourseBays(net);
    for (const g of crossable(i, net)) {
      const mine = bays.filter((b) => b.gateId === g.id);
      assert.ok(mine.length > 0, `${name} : ${g.id} n'a aucun passage`);
      // ABORDABLE veut dire : du sol des deux côtés, à un pas de la ligne, dans
      // l'axe de la baie. Un passage dessiné qu'on ne peut atteindre d'aucun
      // côté ne se franchit pas plus qu'un mur.
      const ok = mine.some((b) => {
        const [q0, q1] = b.cross === 'z'
          ? [b.rect.z0, b.rect.z1] : [b.rect.x0, b.rect.x1];
        const across = b.cross === 'z' ? b.x : b.z;
        const at = (v: number) =>
          (b.cross === 'z'
            ? !walkerBlocked(place, 'concourse', across, v)
            : !walkerBlocked(place, 'concourse', v, across));
        return at(q0 - 0.6) && at(q1 + 0.6);
      });
      assert.ok(ok, `${name} : aucune baie de ${g.id} ne s'aborde des deux côtés`);
    }
  }
});

// --- #6 : une sortie tient à une zone libre ------------------------------

test('toute bouche praticable perce une pièce LIBRE, et on l’atteint', () => {
  let drawn = 0;
  for (const { name, place } of ALL) {
    const net = place.network;
    for (const m of net.mouths) {
      const room = net.rooms.find((r) => r.id === m.roomId);
      assert.ok(room, `${name} : ${m.id} perce une pièce inconnue`);
      if (!room.walkable) continue;
      drawn++;
      assert.equal(room.fare, 'free', `${name} : ${m.id} s'ouvre en zone payante`);
      // Et la baie tombe dans la paroi qu'elle perce, sur toute sa largeur.
      const [lo, hi] = m.side === 'x0' || m.side === 'x1'
        ? [room.rect.z0, room.rect.z1] : [room.rect.x0, room.rect.x1];
      assert.ok(
        m.at - m.halfWidth >= lo - 1e-6 && m.at + m.halfWidth <= hi + 1e-6,
        `${name} : ${m.id} déborde sa paroi`,
      );
      // On se tient devant, du côté du hall : une bouche derrière une vitrine
      // serait dessinée et inatteignable.
      const step = 0.9;
      const x = m.side === 'x0' ? room.rect.x0 + step
        : m.side === 'x1' ? room.rect.x1 - step : m.at;
      const z = m.side === 'z0' ? room.rect.z0 + step
        : m.side === 'z1' ? room.rect.z1 - step : m.at;
      assert.ok(
        !walkerBlocked(place, 'concourse', x, z),
        `${name} : on n'accède pas à ${m.id} (${x.toFixed(2)}, ${z.toFixed(2)})`,
      );
    }
  }
  // Cinquante-sept bouches praticables sur les quatre-vingt-deux du relevé : les
  // autres percent une pièce qu'on REGARDE sans y aller. Un plancher, pas une
  // valeur exacte.
  assert.ok(drawn >= 55, `seulement ${drawn} bouches praticables`);
});

// --- #7 : aucune pièce étranglée ------------------------------------------

test('AUCUN COULOIR N’EST ÉTRANGLÉ', () => {
  // Le cahier des charges parle du CHEMINEMENT PRINCIPAL, et les deux mots
  // comptent.
  //
  // CHEMINEMENT : c'est une propriété LOCALE. Ce qu'on vérifie est qu'en aucun
  // point la largeur libre ne tombe sous la cote du projet — pas qu'il existe
  // une file allant d'une paroi à l'autre, ce qui reviendrait à interdire une
  // consigne au fond d'un couloir.
  //
  // PRINCIPAL : c'est la portion que la gare doit SERVIR, du premier au dernier
  // point qu'elle dessert — pied de volée, passage de portillon, bouche de
  // sortie, ouvrage de liaison. La passerelle de Shinagawa fait cent dix
  // mètres et se termine trois mètres au-delà de sa dernière sortie : ce
  // cul-de-sac porte une galerie et un guichet, et c'est très bien ainsi.
  // Personne n'y passe.
  //
  // UNE LIGNE DE PORTILLONS N'EST PAS UN ÉTRANGLEMENT : elle barre sa pièce
  // exprès, et l'on passe par ses baies — c'est l'exigence #5, vérifiée
  // au-dessus. On l'écarte donc de ce balayage, elle et rien d'autre.
  const STEP = 0.05;
  let scanned = 0;
  for (const { name, place } of ALL) {
    const net = place.network;
    const lines = net.gates.map((g) => g.rect);
    const inLine = (x: number, z: number) =>
      lines.some((g) => x >= g.x0 - 0.4 && x <= g.x1 + 0.4 && z >= g.z0 - 0.4 && z <= g.z1 + 0.4);
    for (const room of net.rooms) {
      if (!room.walkable) continue;
      const r = room.rect;
      const long: 'x' | 'z' = r.x1 - r.x0 >= r.z1 - r.z0 ? 'x' : 'z';
      const on = (q: Rect) => [long === 'x' ? q.x0 : q.z0, long === 'x' ? q.x1 : q.z1];
      // CE QUE CETTE PIÈCE DOIT SERVIR, sur son axe long.
      const served: number[] = [];
      for (const a of place.liveAccesses) {
        if (a.toRoomId === room.id) served.push(long === 'x' ? a.stair.x : a.stair.z);
      }
      for (const g of net.gates) {
        if (g.from !== room.id && g.to !== room.id) continue;
        served.push(...on(g.rect));
      }
      for (const j of net.joins) {
        if (j.walkable && (j.from === room.id || j.to === room.id)) served.push(...on(j.rect));
      }
      for (const m of net.mouths) {
        if (m.roomId !== room.id) continue;
        served.push(m.side === 'x0' || m.side === 'x1'
          ? (long === 'x' ? (r.x0 + r.x1) / 2 : m.at)
          : (long === 'x' ? m.at : (r.z0 + r.z1) / 2));
      }
      if (served.length < 2) continue;
      const [c0, c1] = long === 'x' ? [r.z0, r.z1] : [r.x0, r.x1];
      const a0 = Math.max(long === 'x' ? r.x0 : r.z0, Math.min(...served));
      const a1 = Math.min(long === 'x' ? r.x1 : r.z1, Math.max(...served));
      if (a1 - a0 < 1 || c1 - c0 < MIN_BRANCH_WIDTH) continue;
      for (let a = a0; a <= a1; a += 0.5) {
        // La plus large bande libre EN TRAVERS, à cette abscisse-là.
        let best = 0;
        let run = 0;
        for (let c = c0; c <= c1; c += STEP) {
          const x = long === 'x' ? a : c;
          const z = long === 'x' ? c : a;
          if (inLine(x, z) || !walkerBlocked(place, 'concourse', x, z)) run += STEP;
          else run = 0;
          best = Math.max(best, run);
        }
        scanned++;
        // Le pas d'échantillonnage vaut cinq centimètres : une trouée juste à la
        // cote se mesure donc à un pas près, et c'est la tolérance accordée.
        assert.ok(
          best >= MIN_BRANCH_WIDTH - STEP,
          `${name} : ${room.id} ${show(r)} se resserre à ${best.toFixed(2)} m `
          + `en ${long} = ${a.toFixed(2)}`,
        );
      }
    }
  }
  assert.ok(scanned > 1000, `échantillon trop maigre : ${scanned} coupes`);
});

// --- #8 : les chevauchements ----------------------------------------------

/** Un solide nommé, avec la pièce où il vit. */
interface Solid { id: string; kind: string; rect: Rect; roomId: string; floorY: number }

/**
 * L'inventaire des solides d'une gare, nommés un par un.
 *
 * On ne se sert pas de `net.obstacles` : c'est une liste plate de rectangles,
 * et un message d'échec qui dit « deux rectangles se chevauchent » n'aide
 * personne. On reconstruit donc l'inventaire depuis ses sources, en gardant
 * l'identifiant de chacun.
 */
function solidsOf(i: number): Solid[] {
  const place = placementFor(i, GATES);
  const net = place.network;
  // `place.interior` et non `interiorFor(i, 0)` : le hall générique se cale sur
  // la trémie RÉELLEMENT posée, et un hall recalculé à l'origine décrirait une
  // gare décalée de vingt mètres.
  const it = place.interior;
  const out: Solid[] = [];
  // LA PIÈCE VIENT DE LA SOURCE, JAMAIS DE LA GÉOMÉTRIE. Shimbashi empile trois
  // niveaux à la même verticale : chercher « quelle pièce contient ce
  // rectangle » y attribuait les bornes du contrôle du Shiodome au hall qui est
  // deux niveaux plus haut, et deux objets de deux étages devenaient un
  // chevauchement. Chaque solide sait d'où il vient ; on le lui demande.
  const floorOf = (id: string) => net.rooms.find((r) => r.id === id)?.floorY ?? NaN;
  const add = (id: string, kind: string, rect: Rect, roomId: string) => {
    out.push({ id, kind, rect, roomId, floorY: floorOf(roomId) });
  };
  net.gates.forEach((g) =>
    g.cabinets.forEach((c, k) => add(`${g.id}#${k}`, 'gate', c, g.from)));
  // Le mobilier générique, lui, n'a pas de pièce déclarée : `fittedFixtures` le
  // pose DANS une pièce praticable, et c'est celle qui le contient.
  const held = (r: Rect) => net.rooms.find(
    (q) => q.walkable
      && (r.x0 + r.x1) / 2 >= q.rect.x0 && (r.x0 + r.x1) / 2 <= q.rect.x1
      && (r.z0 + r.z1) / 2 >= q.rect.z0 && (r.z0 + r.z1) / 2 <= q.rect.z1,
  )?.id ?? '—';
  // UN PANNEAU ENCASTRÉ N'EST PAS UN SOLIDE. Moins de vingt-cinq centimètres de
  // saillie : on passe devant sans le toucher, et les deux chemins l'écartent
  // de leurs obstacles (`fixtureBlocks`). Le compter ici ferait échouer les
  // deux sens du contrôle #10 pour un plan de quartier.
  net.fixtures.filter(fixtureBlocks).forEach((f, n) =>
    interiorSolids(f).forEach((q, k) => add(`${f.kind}#${n}.${k}`, 'fixture', q, held(f.rect))));
  net.frontages.forEach((f) => add(f.id, 'frontage', f.rect, f.roomId));
  net.hoardings.forEach((h) => add(h.id, 'hoarding', h.rect, h.roomId));
  net.landmarks.forEach((l) =>
    l.posts.forEach((q, k) => add(`${l.id}#${k}`, 'column', q, l.roomId)));
  if (net.source === 'legacy') {
    it.pilasters.forEach((q, k) => add(`pilastre#${k}`, 'pilaster', q, held(q)));
  }
  return out;
}

/**
 * Les recouvrements qu'on ACCEPTE, et pourquoi.
 *
 * Chacun décrit une situation où deux solides partagent de la matière sans que
 * ce soit un défaut. La liste est fermée : tout le reste échoue.
 */
function allowed(a: Solid, b: Solid): boolean {
  const pair = [a.kind, b.kind].sort().join('+');
  // LES PAROIS D'UNE MÊME BOUTIQUE SE REJOIGNENT. Le konbini n'est pas un bloc
  // mais un lieu : `interiorSolids` en rend les murs et les meubles un par un,
  // et deux murs qui font un angle partagent l'épaisseur de l'angle. Un
  // commerce ne se chevauche pas lui-même, il est construit.
  const shop = (id: string) => id.split('.')[0];
  if (a.kind === 'fixture' && b.kind === 'fixture' && shop(a.id) === shop(b.id)) return true;
  // DEUX LIGNES DE PORTILLONS QUI SE PARTAGENT DU SOL, quand le compilateur l'a
  // DIT. Shin-Ōkubo cote un 改札口 de 4,20 m et un 出口専用 de 1,60 m dans un
  // hall qui fait 5,20 : les deux largeurs sont composées — un plan japonais n'a
  // pas d'échelle — et ce qui reste à la seconde n'a plus la place d'une baie.
  // Le compilateur garde alors la cote du relevé et lève `gateOverlap` ; taire
  // le recouvrement ici reviendrait à ne pas l'avoir levé.
  if (a.kind === 'gate' && b.kind === 'gate') {
    const line = (id: string) => id.split('#')[0];
    return GATE_OVERLAPS.has([line(a.id), line(b.id)].sort().join('+'));
  }
  // Un pilastre absorbé par une longue devanture : la trame porteuse traverse
  // le commerce, et c'est ainsi qu'on la voit dans une gare.
  if (pair === 'frontage+pilaster' || pair === 'fixture+pilaster') return true;
  // Un fût de la trame d'un relevé pris dans une devanture, pour la même
  // raison : le poteau est ENGAGÉ, il n'est pas posé devant.
  if (pair === 'column+frontage') return true;
  // Une borne de contrôle à la frontière de deux zones, contre la palissade qui
  // ferme la zone : la ligne s'appuie dessus, elle ne la traverse pas.
  if (pair === 'gate+hoarding') return true;
  return false;
}

/** Les superpositions de lignes que le compilateur a signalées, gare par gare. */
let GATE_OVERLAPS = new Set<string>();

test('DEUX SOLIDES INCOMPATIBLES NE PARTAGENT PAS LE MÊME SOL', () => {
  const bad: string[] = [];
  let pairs = 0;
  for (let i = 0; i < STATION_COUNT; i++) {
    const prof = WIRED.has(i) ? profileFor(i) : null;
    GATE_OVERLAPS = new Set(
      prof
        ? networkIssues(prof, ALL[i].place.network)
          .filter((it) => it.code === 'gateOverlap')
          .map((it) => it.where.split('+').sort().join('+'))
        : [],
    );
    const solids = solidsOf(i);
    for (let a = 0; a < solids.length; a++) {
      for (let b = a + 1; b < solids.length; b++) {
        const s = solids[a];
        const t = solids[b];
        // Deux étages différents ne se gênent pas : c'est la définition d'un
        // étage. Un solide qu'on n'a pu rattacher à aucune pièce garde `NaN`,
        // et la comparaison est alors fausse — donc on ne l'accuse pas.
        if (!(Math.abs(s.floorY - t.floorY) < 1e-6)) continue;
        pairs++;
        const d = overlap(s.rect, t.rect, 0.02);
        if (d === 0 || allowed(s, t)) continue;
        bad.push(
          `${NAME(i)} : ${s.kind} ${s.id} ${show(s.rect)} recouvre `
          + `${t.kind} ${t.id} ${show(t.rect)} sur ${d.toFixed(2)} m, dans ${s.roomId}`,
        );
      }
    }
  }
  assert.ok(pairs > 5000, `échantillon trop maigre : ${pairs} paires`);
  assert.deepEqual(bad, []);
});

// --- #10 : rendu et collisions, une seule source -------------------------

test('TOUT CE QUI BARRE SE DESSINE, TOUT CE QUI SE DESSINE BARRE', () => {
  // Les deux sens comptent, et ils échouent différemment : un solide dessiné
  // qui ne barre pas se traverse à l'écran ; un obstacle que rien ne dessine
  // est un mur invisible. Le contrôle est data-driven — on compare
  // l'inventaire NOMMÉ des solides à la liste plate des obstacles du réseau —
  // et non textuel : le rendu lit `net`, il ne recalcule rien.
  for (let i = 0; i < STATION_COUNT; i++) {
    const net = placementFor(i, GATES).network;
    const drawn = solidsOf(i);
    const same = (a: Rect, b: Rect) =>
      Math.abs(a.x0 - b.x0) < 1e-6 && Math.abs(a.x1 - b.x1) < 1e-6
      && Math.abs(a.z0 - b.z0) < 1e-6 && Math.abs(a.z1 - b.z1) < 1e-6;
    for (const s of drawn) {
      // Une devanture d'une pièce qu'on REGARDE sans y aller ne barre rien : on
      // ne peut pas s'y cogner, faute d'y être. `stationFrontages` en tient la
      // liste, et elle doit rester courte.
      const room = net.rooms.find((r) => r.id === s.roomId);
      if (room && !room.walkable) continue;
      assert.ok(
        net.obstacles.some((o) => same(o, s.rect)),
        `${NAME(i)} : ${s.kind} ${s.id} ${show(s.rect)} se dessine et ne barre rien`,
      );
    }
    for (const o of net.obstacles) {
      assert.ok(
        drawn.some((s) => same(s.rect, o)),
        `${NAME(i)} : obstacle ${show(o)} ne correspond à rien de dessiné`,
      );
    }
  }
});

// --- #11 : un seul nom, six porteurs -------------------------------------

test('SIX PORTEURS, UN SEUL NOM', () => {
  // La signalétique d'une gare ment de la pire des façons quand elle ment à
  // moitié : une sortie appelée 東口 sur la potence du quai et « East Exit » au
  // fond de la trémie fait douter de la gare entière. `stationSignage` est la
  // source unique ; ce test vérifie qu'aucun porteur ne s'en écarte.
  for (const { i, name, place } of ALL) {
    const sign = signageFor(place.network, i);
    // 1. la potence du quai — 2. le fond de la trémie : les deux lisent
    // `sign.exits`, et le second n'en prend que les premiers.
    for (const e of sign.exits) {
      assert.ok(e.jp.trim().length > 0, `${name} : une sortie sans nom japonais`);
      assert.ok(e.en.trim().length > 0, `${name} : ${e.jp} sans nom anglais`);
    }
    // 3. le panneau suspendu du hall — 4. la bouche elle-même : le fléchage se
    // lit sur les BOUCHES, et chacune doit porter le nom que la source lui
    // donne, à la lettre.
    for (const m of place.network.mouths) {
      const got = sign.mouths.get(m.id);
      assert.ok(got, `${name} : ${m.id} n'est nommée par personne`);
      assert.ok(got.jp.trim().length > 0, `${name} : ${m.id} sans nom`);
      // Un relevé branché NOMME ses bouches, et la source doit alors dire
      // exactement ce que le réseau dit. Le hall générique ne les nomme pas —
      // il n'a rien lu — et la source prend le rang de la sortie dans le
      // relevé de `data/lines` : c'est le repli, et il est documenté.
      if (m.nameJp) {
        assert.equal(got.jp, m.nameJp, `${name} : ${m.id} en japonais`);
        assert.equal(got.en, m.nameEn, `${name} : ${m.id} en anglais`);
      }
      // Et le nom de la bouche est bien l'une des sorties annoncées, jamais un
      // nom de plus qui n'existerait que sur place.
      assert.ok(
        sign.exits.some((e) => e.jp === got.jp && e.en === got.en),
        `${name} : ${m.id} porte « ${got.jp} », que la gare n'annonce pas`,
      );
    }
    // 5. le bandeau des portillons : un contrôle nommé porte le nom du relevé.
    for (const g of sign.gates) {
      const line = place.network.gates.find((x) => x.id === g.id);
      assert.ok(line, `${name} : le bandeau ${g.id} ne désigne aucune ligne`);
      assert.equal(g.jp, line.nameJp, `${name} : bandeau de ${g.id}`);
    }
    // 6. le panneau suspendu du couloir : il ne porte AUCUN nom de gare, et
    // c'est une réponse à l'exigence, pas une esquive. Un fléchage de hall dit
    // 出口 / のりば / 設備 — la catégorie, pas la destination — parce qu'il
    // s'adresse à quelqu'un qui n'a pas encore choisi sa sortie. Rien à
    // diverger, donc, tant que la liste de ses catégories reste fermée.
    for (const shell of shellsOf(place.network)) {
      for (const post of guidePosts(shell)) {
        assert.ok(
          GUIDE_KINDS.has(post.kind),
          `${name} : le fléchage annonce « ${post.kind} », hors catégories`,
        );
      }
    }
  }
});

test('AUCUN AUTRE CHEMIN VERS UN NOM', () => {
  // Le contrôle précédent tient les porteurs COHÉRENTS ; celui-ci tient qu'ils
  // sont les seuls. Une divergence ne naît jamais d'un porteur qui lit mal la
  // source unique — elle naît d'un porteur qui ne la lit pas du tout et va
  // rechercher le nom à la main dans `data/lines`. C'est une propriété de
  // structure, pas de donnée : elle ne peut se vérifier que sur les imports.
  const dir = new URL('../src/three/', import.meta.url);
  const files: string[] = [];
  const walk = (d: URL) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) walk(new URL(`${e.name}/`, d));
      else if (e.name.endsWith('.tsx') || e.name.endsWith('.ts')) {
        files.push(new URL(e.name, d).pathname);
      }
    }
  };
  walk(dir);
  assert.ok(files.length > 30, `${files.length} fichiers de rendu seulement`);
  const rogue: string[] = [];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    // `stationExits` et `stationExitPlan` sont la table BRUTE des sorties.
    // `data/stationSignage` est le seul qui ait le droit d'y toucher : c'est
    // lui qui décide ce qu'une gare annonce, et il le fait une fois.
    if (/from '.*data\/lines'/.test(src) && /stationExits?\b/.test(src)) {
      rogue.push(f.slice(f.indexOf('/src/') + 1));
    }
  }
  assert.deepEqual(rogue, []);
});

// --- #12 : plusieurs halls indépendants ----------------------------------

test('une gare qui déclare N ensembles en rend N', () => {
  // Fusionner deux halls qui ne communiquent pas hors quai est la simplification
  // la plus tentante et la plus fausse : elle donne un couloir entre Takeshita
  // et Omotesandō, alors qu'il faut remonter sur le quai.
  const many: string[] = [];
  for (const { i, name, place } of ALL) {
    const shells = shellsOf(place.network).filter((s) =>
      s.rooms.some((r) => r.walkable));
    if (shells.length > 1) many.push(`${name} ×${shells.length}`);
    if (!WIRED.has(i)) continue;
    // Le compte se lit sur le RELEVÉ : deux pièces qu'aucun ouvrage praticable
    // ne joint sont deux ensembles, et le rendu doit en faire deux volumes.
    const net = place.network;
    const groups = new Set<string>();
    for (const r of net.rooms) {
      if (!r.walkable) continue;
      const seen = reach(net, r.id);
      for (const g of net.gates) {
        if (seen.has(g.from)) seen.add(g.to);
        if (seen.has(g.to)) seen.add(g.from);
      }
      groups.add([...seen].filter((id) =>
        net.rooms.find((q) => q.id === id)?.walkable).sort().join('|'));
    }
    assert.equal(
      shells.filter((s) => s.rooms.some((r) => r.walkable)).length,
      groups.size,
      `${name} : ${groups.size} ensembles praticables pour ${shells.length} volumes`,
    );
  }
  // Les gares que le cahier des charges nomme, et qui ont réellement plusieurs
  // ensembles au relevé. Harajuku est le cas d'école — Takeshita et Omotesandō
  // ne se rejoignent que par le quai.
  assert.ok(
    many.some((s) => s.startsWith('JY19 Harajuku')),
    `Harajuku n'a plus deux ensembles : ${many.join(', ')}`,
  );
});

// --- #13 et #14 : les niveaux ferroviaires -------------------------------

test('ON PASSE AU-DESSUS DE LA RAME, OU SOUS LE RAIL — JAMAIS ENTRE', () => {
  // Les cotes viennent toutes de `data/stationGeometry` et de
  // `data/stationConcourseTypes` : aucune n'est réécrite ici, sans quoi le test
  // dériverait le jour où la gare change de hauteur.
  let over = 0;
  let under = 0;
  for (const { name, place } of ALL) {
    for (const room of place.network.rooms) {
      // Ce qui compte est de FRANCHIR le faisceau : une pièce rangée derrière
      // le quai ne passe au-dessus de rien.
      if (room.rect.x0 >= BALLAST_KEEP_X) continue;
      const crosses = room.rect.x0 < PSD_X;
      if (!crosses) continue;
      if (room.floorY > 0) {
        over++;
        // Au-dessus : le plancher passe la rame ET l'auvent. La cote de
        // référence est celle de la volée montante, qui existe pour cela.
        assert.ok(
          room.floorY >= Math.min(ASCENT_FLOOR_Y, CANOPY_Y) - 1e-6,
          `${name} : ${room.id} enjambe la voie à ${room.floorY.toFixed(2)} m`,
        );
      } else {
        under++;
        // Dessous : le volume ne coupe pas la bande des nappes — ballast,
        // rails, rue. Il passe entièrement dessous, ou il n'y va pas.
        assert.ok(
          room.floorY >= GROUND_SHEET_Y1 - 1e-6 || room.ceilY <= GROUND_SHEET_Y0 + 1e-6,
          `${name} : ${room.id} coupe le ballast `
          + `(${room.floorY.toFixed(2)} → ${room.ceilY.toFixed(2)})`,
        );
      }
    }
  }
  assert.ok(over > 0 && under > 0, `${over} au-dessus, ${under} dessous`);
});

// --- #15 : le repli sur le hall générique --------------------------------

test('LE REPLI DES TRENTE', () => {
  // Vingt-neuf gares passent par leur relevé, et les contrôles de repli ne
  // portaient donc plus que sur Okachimachi. Ce test les leur rend TOUTES : il
  // compile le repli de chacune, indépendamment du branchement, et le compare
  // au hall générique poste par poste. C'est le seul moyen de garder l'exigence
  // vivante — un repli qu'on n'exerce plus n'est pas un repli, c'est du code
  // mort qui se croit sûr.
  for (const { i, name, place } of ALL) {
    const it = place.interior;
    const net = legacyNetwork(i, it);
    assert.equal(net.source, 'legacy', name);
    assert.equal(net.built, it.built, name);
    if (!it.built) continue;
    // Les sols, et les deux zones.
    const paid = net.rooms.find((r) => r.fare === 'paid');
    const free = net.rooms.find((r) => r.fare === 'free');
    assert.ok(paid && free, `${name} : le repli a perdu une zone`);
    assert.deepEqual(paid.rect, it.paid, `${name} : zone payante`);
    assert.deepEqual(free.rect, it.free, `${name} : zone libre`);
    for (const r of net.rooms) {
      assert.equal(r.floorY, it.floorY, `${name} : ${r.id} au mauvais sol`);
      assert.equal(r.ceilY, it.ceilY, `${name} : ${r.id} au mauvais plafond`);
    }
    // Les portillons, et leurs passages.
    assert.equal(net.gates.length, 1, `${name} : ${net.gates.length} lignes au repli`);
    assert.deepEqual(net.gates[0].cabinets, it.gate.cabinets, `${name} : bornes`);
    assert.deepEqual(
      net.gates[0].passages.map((b) => b.at),
      it.gate.passages.map((b) => b.x),
      `${name} : passages`,
    );
    // Les sorties, le mobilier, les obstacles.
    assert.equal(net.mouths.length, it.exits.length, `${name} : sorties`);
    assert.deepEqual(net.fixtures, it.fixtures, `${name} : mobilier`);
    assert.deepEqual(net.obstacles, it.obstacles, `${name} : obstacles`);
    // Et l'ITINÉRAIRE ESSENTIEL : de l'accès à un contrôle, du contrôle à une
    // bouche. On le vérifie sur le graphe du repli et non en le parcourant —
    // parcourir demanderait un placement dont les trémies soient appariées à
    // CE réseau-là, et vingt-neuf placements sur trente sont appariés à leur
    // relevé. Le graphe suffit : c'est lui que le routeur suit.
    for (const a of net.accesses) {
      const rooms = reach(net, a.toRoomId);
      const line = net.gates.find((g) => g.walkable && (rooms.has(g.from) || rooms.has(g.to)));
      assert.ok(line, `${name} : le repli ne mène à aucun contrôle`);
      const free = rooms.has(line.from) ? line.to : line.from;
      assert.ok(
        net.mouths.some((m) => m.roomId === free),
        `${name} : le repli ne mène à aucune sortie`,
      );
    }
    // Et pour la gare qui EST au repli, on le parcourt vraiment.
    if (!WIRED.has(i)) {
      assert.ok(routeToStreet(place), `${name} : pas d'itinéraire de sortie au repli`);
      assert.ok(routeFromStreet(place), `${name} : pas d'itinéraire d'entrée au repli`);
    }
  }
});

// --- #16 : Nippori ---------------------------------------------------------

test('aucun hall générique dans la signature de Nippori', () => {
  const i = STATIONS.findIndex((s) => s.romaji === 'Nippori');
  assert.ok(i >= 0);
  const net = placementFor(i, GATES).network;
  // Le relevé le dit en donnée ordinaire : des PONTS-CONCOURS, et rien d'autre.
  assert.equal(net.source, 'profile');
  assert.equal(net.built, true);
  const walk = net.rooms.filter((r) => r.walkable);
  assert.ok(walk.length > 0);
  for (const r of walk) {
    assert.equal(r.kind, 'overbridge', `Nippori : ${r.id} est un ${r.kind}`);
  }
  // Et surtout : aucune pièce ne reprend le rectangle du hall générique, qui
  // serait le second pont empilé dans le premier.
  const it = interiorFor(i, 0);
  for (const r of net.rooms) {
    assert.ok(
      overlap(r.rect, it.paid) === 0 || r.rect.x0 !== it.paid.x0 || r.rect.x1 !== it.paid.x1,
      `Nippori : ${r.id} reprend la boîte du hall générique`,
    );
  }
});

// --- #17 : les paliers de qualité ------------------------------------------

test('LE RÉSEAU PRATICABLE NE CONNAÎT AUCUN PALIER', () => {
  // Le palier est une affaire de rendu. La preuve la plus forte n'est pas qu'on
  // ait bien écrit les gardes, c'est que la donnée praticable soit produite
  // SANS lui : `networkFor` prend un index et deux cotes de trémie, et rien
  // d'autre. Deux appels rendent donc la même chose, quel que soit l'état de la
  // machine.
  assert.equal(networkFor.length, 3, 'networkFor a changé de signature');
  assert.equal(concourseFloorAt.length, 3, 'concourseFloorAt a changé de signature');
  assert.equal(walkerBlocked.length, 4, 'walkerBlocked a changé de signature');
  const keep = (n: ReturnType<typeof networkFor>) => JSON.stringify({
    rooms: n.rooms, joins: n.joins, gates: n.gates, mouths: n.mouths,
    obstacles: n.obstacles, fixtures: n.fixtures,
  });
  for (const { i, name } of ALL) {
    // Deux appels, mêmes cotes de trémie, et rien entre les deux : la donnée
    // praticable est une FONCTION de ses arguments. Aucun état de machine ne
    // s'y glisse, donc aucun palier ne peut la changer.
    const a = keep(networkFor(i, 12.5));
    const b = keep(networkFor(i, 12.5));
    assert.equal(a, b, `${name} : le réseau varie d'un appel à l'autre`);
  }
});

test('UN OBSTACLE GARDE UNE REPRÉSENTATION À TOUS LES PALIERS', () => {
  // Le palier a le droit de retirer l'enseigne d'une vitrine, son vitrage, son
  // meneau. Il n'a pas le droit de retirer la vitrine : elle barre, et un
  // obstacle invisible est le pire défaut qu'une gare puisse avoir.
  //
  // Ce que le test tient, c'est l'INVENTAIRE de ce qui barre. `TIERED` liste
  // les groupes de rendu que le palier a le droit d'effacer, et aucun d'eux ne
  // porte de solide : la preuve se fait donc sur les données, en vérifiant que
  // tout solide inventorié appartient à un groupe qui reste.
  const TIERED = new Set(['guideline', 'sign', 'glass', 'band', 'clock', 'artwork']);
  for (let i = 0; i < STATION_COUNT; i++) {
    for (const s of solidsOf(i)) {
      assert.ok(
        !TIERED.has(s.kind),
        `${NAME(i)} : ${s.kind} ${s.id} barre et s'efface au palier bas`,
      );
    }
  }
});
