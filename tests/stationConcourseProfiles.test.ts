// Les trente relevés (src/data/stationConcourseProfiles).
//
// `stationConcourseProfile.test` éprouve le VALIDATEUR sur un profil de
// laboratoire qu'on casse défaut par défaut. Ce fichier-ci fait l'inverse : il
// prend les trente vraies gares et vérifie qu'elles tiennent debout.
//
// CE QU'UN TEST NE PEUT PAS FAIRE, et il faut le dire tout de suite : il ne
// sait pas lire un plan. Il ne dira jamais que le Shōwa-dōri Gate est au sud
// plutôt qu'au nord, ni qu'un hall fait quarante mètres plutôt que trente. Ce
// qui se protège ici, c'est la DISCIPLINE qui rend le relevé contestable :
//
//   · que les trente profils restent cohérents - tout accès mène à un
//     contrôle, tout contrôle débouche sur une zone libre, toute sortie part
//     d'une zone libre ;
//   · qu'aucun profil ne se déclare mieux vérifié qu'il ne l'est ;
//   · que les NOMS ne soient jamais recopiés d'un fichier à l'autre, parce
//     qu'une copie diverge au premier correctif ;
//   · qu'aucune ENSEIGNE n'apparaisse sans avoir été lue sur un plan - la
//     liste est fermée, et une marque de plus est une décision, pas un
//     glissement ;
//   · que les quatre faits qu'aucune génération ne produit - carte seule,
//     sortie seule, horaires, contrôle entre exploitants - ne disparaissent
//     pas en silence ;
//   · que le nombre de gares dont l'emprise SORT de la bande du quai reste
//     sous les yeux : c'est le verrou de la phase 6.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONCOURSE_PROFILES,
  profileFor,
} from '../src/data/stationConcourseProfiles.ts';
import { validateProfile } from '../src/data/stationConcourseTypes.ts';
import { LINES, stationExitPlan } from '../src/data/lines.ts';
import { layoutFor } from '../src/data/stationLayouts.ts';
import { PSD_X } from '../src/data/stationGeometry.ts';
import { REFERENCE_DATE, sourcesFor } from '../src/data/stationConcourseSources.ts';
import { STATION_COUNT } from '../src/data/loop.ts';
import { STATIONS } from '../src/data/stations.ts';

const NAME = (i: number) => `${STATIONS[i].jy} ${STATIONS[i].romaji}`;

test('les trente gares ont un profil, dans l’ordre', () => {
  assert.equal(CONCOURSE_PROFILES.length, STATION_COUNT);
  for (let i = 0; i < STATION_COUNT; i++) {
    assert.equal(CONCOURSE_PROFILES[i].stationIndex, i, NAME(i));
    // Mémoïsé : deux appels rendent le MÊME objet, pas deux copies.
    assert.equal(profileFor(i), CONCOURSE_PROFILES[i], NAME(i));
  }
  // La boucle n'a pas de terminus.
  assert.equal(profileFor(30), CONCOURSE_PROFILES[0]);
  assert.equal(profileFor(-1), CONCOURSE_PROFILES[29]);
});

test('les trente profils passent le validateur', () => {
  // LE TEST CENTRAL. `validateProfile` porte la moitié des contrôles
  // obligatoires du chantier - graphe praticable, signes de dénivelé, côtés
  // payant / libre, rectangles emboîtés, enseignes justifiées - et il est ici
  // appliqué aux trente gares d'un coup.
  for (const p of CONCOURSE_PROFILES) {
    const issues = validateProfile(p);
    assert.deepEqual(
      issues,
      [],
      `${NAME(p.stationIndex)} :\n`
        + issues.map((it) => `  [${it.code}] ${it.where} — ${it.message}`).join('\n'),
    );
  }
});

test('aucun profil ne se déclare mieux vérifié qu’il ne l’est', () => {
  for (const p of CONCOURSE_PROFILES) {
    // `verified` demanderait des COTES relevées, pas seulement une topologie
    // lue : les plans JR East n'ont ni échelle ni cotation, donc le plafond
    // est `mostlyVerified` et il le restera.
    assert.notEqual(p.confidence, 'verified', NAME(p.stationIndex));
    assert.equal(p.referenceDate, REFERENCE_DATE, NAME(p.stationIndex));
    // Les sources ne sont pas recopiées : elles viennent du registre.
    assert.equal(p.sources, sourcesFor(p.stationIndex).sources, NAME(p.stationIndex));
    assert.ok(
      p.sources.some((s) => s.retrieval === 'read' && s.tier === 1),
      `${NAME(p.stationIndex)} : aucun plan officiel lu`,
    );
  }
  // Quatre gares restent `approximate`, et toutes pour la même raison : leur
  // plan est vieux. Uguisudani 2022, Okachimachi 2024-01, Nishi-Nippori et
  // Tabata 2024-02. Si cette liste change, c'est qu'un plan a été relu.
  const approx = CONCOURSE_PROFILES
    .filter((p) => p.confidence === 'approximate')
    .map((p) => NAME(p.stationIndex));
  assert.deepEqual(approx, [
    'JY04 Okachimachi',
    'JY06 Uguisudani',
    'JY08 Nishi-Nippori',
    'JY09 Tabata',
  ]);
});

test('les sorties ne sont pas recopiées : elles viennent du relevé', () => {
  // `data/lines` porte déjà le dépouillement des trente plans (phase 3). Un
  // profil qui réécrirait les noms les ferait diverger au premier correctif,
  // et personne ne s'en apercevrait avant d'avoir deux panneaux différents en
  // haut et en bas des mêmes marches.
  for (let i = 0; i < STATION_COUNT; i++) {
    const plan = stationExitPlan(i);
    const exits = CONCOURSE_PROFILES[i].exits;
    assert.ok(exits.length >= 2, `${NAME(i)} : moins de deux sorties`);
    assert.ok(exits.length <= plan.length, `${NAME(i)} : plus de sorties que le relevé`);
    exits.forEach((e, k) => {
      assert.equal(e.nameJp, plan[k].jp, `${NAME(i)} : sortie ${k}`);
      assert.equal(e.nameEn, plan[k].en, `${NAME(i)} : sortie ${k}`);
      // Un nom non relevé reste marqué comme tel jusqu'ici.
      assert.equal(
        e.confidence,
        plan[k].unsourced ? 'unverified' : 'high',
        `${NAME(i)} : ${e.nameEn} a perdu sa provenance`,
      );
    });
  }
});

test('toute ligne citée en correspondance existe', () => {
  // Une clé absente de `data/lines` rendrait une pastille grise et un romaji
  // vide : la correspondance serait dessinée sans être nommée.
  for (const p of CONCOURSE_PROFILES) {
    for (const t of p.transferPortals) {
      assert.ok(t.lines.length > 0, `${NAME(p.stationIndex)} : ${t.id} sans ligne`);
      for (const key of t.lines) {
        assert.ok(LINES[key], `${NAME(p.stationIndex)} : ligne inconnue « ${key} » (${t.id})`);
      }
    }
  }
});

test('la liste des enseignes est fermée', () => {
  // LA RÈGLE DU CHANTIER : on n'invente jamais une enseigne. Chacune de
  // celles-ci a été lue sur un plan officiel, et trois d'entre elles sont des
  // MANQUES QUE LE RELEVÉ A COMBLÉS - le dépôt ne déclarait ni atre vie à
  // Sugamo, ni atre à Gotanda, ni Dila à Ōsaki.
  const expected = [
    'Dila Osaki',
    'EATo LUMINE',
    'GRANSTA TOKYO',
    'JR-EAST Hotel Mets Gotanda',
    'JR-EAST Hotel Mets Komagome',
    'LUMINE EST Shinjuku',
    'LUMINE STREET',
    'NEWoMan',
    'NewDays',
    'Seibu Department Store',
    'THE TOKYO STATION HOTEL',
    'Tobu Department Store',
    'atre Akihabara 1',
    'atre Akihabara 2',
    'atre Ebisu',
    'atre Gotanda 1',
    'atre Gotanda 2',
    'atre Meguro 1',
    'atre Ueno',
    'atre vie Sugamo',
    'atre vie Tabata',
    'ecute Akihabara',
    'ecute Nippori',
    'ecute Shinagawa',
    'ecute Ueno',
  ];
  const actual = [...new Set(
    CONCOURSE_PROFILES.flatMap((p) => p.commercialZones.map((zone) => zone.brand ?? '')),
  )].sort();
  assert.deepEqual(actual, expected, 'une enseigne est apparue ou a disparu sans être documentée');
});

test('les trois manques que le relevé a comblés sont bien là', () => {
  // Ils valent d'être testés nommément : ce sont les seuls endroits où le
  // relevé AJOUTE au dépôt au lieu de le confirmer.
  const brandsOf = (i: number) => CONCOURSE_PROFILES[i].commercialZones.map((z) => z.brand);
  assert.ok(brandsOf(10).includes('atre vie Sugamo'), 'JY11 Sugamo : atre vie perdu');
  assert.ok(brandsOf(22).includes('atre Gotanda 1'), 'JY23 Gotanda : atre 1 perdu');
  assert.ok(brandsOf(22).includes('atre Gotanda 2'), 'JY23 Gotanda : atre 2 perdu');
  assert.ok(brandsOf(23).includes('Dila Osaki'), 'JY24 Ōsaki : Dila perdue');
  // Et l'enseigne de Tabata est atre VIE, pas atre.
  assert.ok(brandsOf(8).includes('atre vie Tabata'), 'JY09 Tabata : atre vie perdu');
});

test('les quatre faits qu’aucune génération ne produit tiennent, et sont bornés', () => {
  // Ils viennent tous d'une mention écrite sur un plan, et aucun moteur ne les
  // aurait devinés. Chaque liste est FERMÉE : une gare de plus est une lecture,
  // pas un réglage.
  const has = (pick: (p: (typeof CONCOURSE_PROFILES)[number]) => boolean) =>
    CONCOURSE_PROFILES.filter(pick).map((p) => NAME(p.stationIndex));

  // « IC card only » — le contrôle n'accepte que la carte sans contact.
  assert.deepEqual(
    has((p) => p.gateGroups.some((g) => g.icOnly)),
    ['JY01 Tokyo', 'JY16 Shin-Ōkubo', 'JY30 Yūrakuchō'],
  );
  // « Exit Only » — un passage à sens unique.
  assert.deepEqual(
    has((p) => p.gateGroups.some((g) => g.exitOnly)),
    ['JY16 Shin-Ōkubo', 'JY20 Shibuya'],
  );
  // Des contrôles qui FERMENT LA NUIT, et le plan donne leurs horaires.
  assert.deepEqual(
    has((p) => p.gateGroups.some((g) => g.hours)),
    ['JY17 Shinjuku'],
  );
  // Une ligne de contrôle ENTRE DEUX ZONES PAYANTES : on change d'exploitant
  // sans repasser en zone libre. `GateGroup` ne sait pas le dire - il relie du
  // payant à du libre par construction - d'où `TransferPortal.gated`.
  assert.deepEqual(
    has((p) => p.transferPortals.some((t) => t.gated)),
    [
      'JY01 Tokyo',
      'JY05 Ueno',
      'JY07 Nippori',
      'JY13 Ikebukuro',
      'JY15 Takadanobaba',
      'JY17 Shinjuku',
      'JY23 Gotanda',
      'JY25 Shinagawa',
      'JY28 Hamamatsuchō',
    ],
  );
});

test('l’emprise est calculée, jamais écrite', () => {
  // Une emprise saisie à la main finit par mentir sur ce qu'elle contient, au
  // premier hall déplacé. On la recalcule ici comme le fichier la calcule, et
  // l'on vérifie qu'elle colle EXACTEMENT - ni trop large, ni trop juste.
  for (const p of CONCOURSE_PROFILES) {
    const rects = [
      ...p.concourses.map((n) => n.rect),
      ...p.corridors.map((c) => c.rect),
      ...p.gateGroups.map((g) => g.rect),
    ];
    const x0 = Math.min(...rects.map((r) => r.x0));
    const x1 = Math.max(...rects.map((r) => r.x1));
    const z0 = Math.min(...rects.map((r) => r.z0));
    const z1 = Math.max(...rects.map((r) => r.z1));
    assert.deepEqual(p.footprint, { x0, x1, z0, z1 }, NAME(p.stationIndex));
  }
});

test('SEPT gares tiennent dans la bande du quai — les vingt-trois autres en sortent', () => {
  // LE VERROU DE LA PHASE 6, et il est chiffré ici pour qu'on ne l'oublie pas.
  //
  // `data/stationInterior` ne sait bâtir qu'entre `PSD_X` et le fond de quai :
  // au-delà, la nappe de rue et le ballast reprennent leur place un mètre sous
  // la dalle (`three/groundStrip`) et couperaient le hall à hauteur d'épaule.
  // Or vingt-trois gares sur trente ont un ouvrage TRANSVERSAL - passerelle,
  // pont-concourse, plateau, souterrain qui passe sous les voies - et leur
  // emprise sort franchement de cette bande.
  //
  // Tant que la phase 6 n'a pas appris au décor à lire `footprint`, ces
  // emprises sont exactes et inexploitables. Les sept qui tiennent sont les
  // seules gares dont le hall suit vraiment l'axe du quai.
  const inBand: string[] = [];
  for (const p of CONCOURSE_PROFILES) {
    const depth = layoutFor(p.stationIndex).depth;
    const f = p.footprint;
    if (f.x0 >= PSD_X && f.x1 <= PSD_X + depth) inBand.push(NAME(p.stationIndex));
  }
  assert.deepEqual(inBand, [
    'JY02 Kanda',
    'JY04 Okachimachi',
    'JY12 Ōtsuka',
    'JY15 Takadanobaba',
    'JY18 Yoyogi',
    'JY29 Shimbashi',
    'JY30 Yūrakuchō',
  ]);
});

test('Harajuku a DEUX ensembles praticables, et rien ne les relie hors quai', () => {
  // L'exception du relevé, et celle qui a corrigé le validateur : le
  // souterrain de Takeshita (B1F) et le bâtiment de 2020 (2F) sont si petits
  // que l'un ne suffirait pas à faire une gare. Ils sont tous les deux
  // parcourus, et pourtant AUCUN couloir ne les joint - c'est le quai qui les
  // relie, et le quai n'est pas un nœud du profil.
  const p = CONCOURSE_PROFILES[18];
  const walk = p.concourses.filter((n) => n.depiction === 'walkable').map((n) => n.id);
  assert.deepEqual(walk.sort(), [
    'free-omote',
    'free-takeshita',
    'paid-omote',
    'paid-takeshita',
  ]);
  assert.equal(p.corridors.length, 0, 'un couloir est apparu entre les deux ensembles');
  assert.equal(
    p.platformAccesses.filter((a) => a.depiction === 'walkable').length,
    2,
    'les deux ensembles ne se prennent plus par le quai',
  );
  // Et le validateur ne crie pas à l’orphelin : c'est tout l'objet du
  // correctif apporté à `validateProfile`.
  assert.deepEqual(validateProfile(p), []);
});

test('chaque gare dit ce qu’elle ne sait pas', () => {
  // Un profil sans question ouverte serait un profil qui prétend avoir tout
  // lu. Aucun des trente n'est dans ce cas, et le dire est la moitié du
  // travail : chaque fiche porte ce qui reste à vérifier, nommément.
  for (const p of CONCOURSE_PROFILES) {
    assert.ok(
      (p.openQuestions?.length ?? 0) >= 2,
      `${NAME(p.stationIndex)} : moins de deux questions ouvertes — trop beau pour être vrai`,
    );
  }
});

test('les huit gares en travaux portent leur chantier', () => {
  // Le plan de chacune délimite au moins une zone « Under Construction », ou
  // se déclare lui-même provisoire. Une gare en travaux n'est pas une gare
  // abîmée : c'est une gare AUTRE, et l'oublier changerait ce qu'on montre.
  const works = CONCOURSE_PROFILES.filter((p) => p.works).map((p) => NAME(p.stationIndex));
  assert.deepEqual(works, [
    'JY01 Tokyo',
    'JY05 Ueno',
    'JY17 Shinjuku',
    'JY20 Shibuya',
    'JY25 Shinagawa',
    'JY27 Tamachi',
    'JY28 Hamamatsuchō',
    'JY29 Shimbashi',
  ]);
});
