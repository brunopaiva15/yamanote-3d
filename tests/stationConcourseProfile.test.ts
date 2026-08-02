// Le FORMAT des profils de gare (src/data/stationConcourseTypes).
//
// Il n'y a pas encore une seule gare décrite : ce test vérifie le VALIDATEUR,
// pas le relevé. C'est l'ordre qui convient - la moitié des contrôles
// obligatoires du chantier (« chaque accès rejoint un niveau existant »,
// « chaque chemin principal rejoint un groupe de portillons », « chaque sortie
// est reliée à une zone libre ») sont écrits une fois dans `validateProfile` et
// seront appelés sur les trente gares. Un validateur qui laisse passer un
// graphe cassé ne protège rien, et c'est exactement ce qu'on vérifie ici : on
// part d'un profil sain et on le casse, une faute à la fois.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isWalkable,
  MIN_BRANCH_WIDTH,
  MIN_HEADROOM,
  validateProfile,
  type StationConcourseProfile,
} from '../src/data/stationConcourseTypes.ts';

/**
 * Une petite gare saine : un accès qui descend, un hall payant, une ligne de
 * portillons, un hall libre, une sortie. Le strict minimum d'une gare de la
 * boucle - c'est à peu près Uguisudani.
 */
function sane(): StationConcourseProfile {
  return {
    stationIndex: 5,
    referenceDate: '2026-08',
    confidence: 'approximate',
    primaryAccessId: 'acc.south',
    place: 'belowPlatform',
    footprint: { x0: 1.78, x1: 9.0, z0: 8, z1: 62 },
    levels: [
      { id: 'lvl.b1', relative: 'belowPlatform', floorY: -3.675, headroom: 2.4, label: 'B1F' },
    ],
    platformAccesses: [
      {
        id: 'acc.south',
        kind: 'stairs',
        order: 0,
        toNodeId: 'node.paid',
        rise: 'down',
        depiction: 'walkable',
      },
    ],
    concourses: [
      {
        id: 'node.paid',
        levelId: 'lvl.b1',
        kind: 'linear',
        fare: 'paid',
        rect: { x0: 2.1, x1: 8.6, z0: 20, z1: 32 },
        depiction: 'walkable',
      },
      {
        id: 'node.free',
        levelId: 'lvl.b1',
        kind: 'linear',
        fare: 'free',
        rect: { x0: 2.1, x1: 8.6, z0: 33.7, z1: 50 },
        depiction: 'walkable',
      },
    ],
    corridors: [],
    gateGroups: [
      {
        id: 'gate.south',
        nameJp: '南改札',
        nameEn: 'South Gate',
        from: 'node.paid',
        to: 'node.free',
        rect: { x0: 2.1, x1: 8.6, z0: 32, z1: 33.7 },
        cross: 'z',
        passages: 4,
        wideAt: 'end',
        depiction: 'walkable',
      },
    ],
    exits: [
      {
        id: 'exit.south',
        nameJp: '南口',
        nameEn: 'South Exit',
        fromNodeId: 'node.free',
        depiction: 'walkable',
        bearing: 'S',
      },
    ],
    transferPortals: [],
    commercialZones: [
      {
        id: 'shop.kiosk',
        nodeId: 'node.free',
        status: 'categoryVerified',
        category: 'kiosk',
        rect: { x0: 2.1, x1: 3.4, z0: 40, z1: 44 },
        enterable: false,
      },
    ],
    landmarks: [],
    sources: [
      {
        tier: 1,
        retrieval: 'indexed',
        publisher: 'JR East',
        title: 'plan de gare (exemple de test)',
        documentDate: '2026',
        consultedAt: '2026-08',
      },
    ],
  };
}

/** Le profil sain, cassé d'une seule façon. */
function broken(mutate: (p: StationConcourseProfile) => void): StationConcourseProfile {
  const p = structuredClone(sane()) as StationConcourseProfile;
  mutate(p);
  return p;
}

/** Les codes de défaut rapportés, sans leur ordre. */
function codes(p: StationConcourseProfile): string[] {
  return validateProfile(p).map((i) => i.code).sort();
}

test('un profil sain ne rapporte aucun défaut', () => {
  assert.deepEqual(validateProfile(sane()), []);
});

test('le relevé doit porter sa date et ses sources', () => {
  assert.ok(codes(broken((p) => { (p as { referenceDate: string }).referenceDate = 'août 2026'; })).includes('date'));
  assert.ok(codes(broken((p) => { (p as { sources: unknown[] }).sources = []; })).includes('sources'));
  assert.ok(
    codes(broken((p) => {
      (p.sources as { consultedAt: string }[])[0].consultedAt = 'récemment';
    })).includes('sourceDate'),
  );
});

test('on ne se déclare pas « vérifié » sur un plan qu’on n’a pas ouvert', () => {
  // La seule règle du validateur qui parle de MÉTHODE plutôt que de cohérence.
  // Elle compte, ici et maintenant : l'environnement de développement de ce
  // dépôt n'atteint pas les sites des opérateurs, donc aucun plan officiel n'a
  // été lu, donc aucune gare ne peut légitimement se dire vérifiée.
  const claimed = broken((p) => { (p as { confidence: string }).confidence = 'verified'; });
  assert.ok(codes(claimed).includes('overclaimed'));

  // La même déclaration passe dès qu'un plan officiel est réellement lu.
  const honest = broken((p) => {
    (p as { confidence: string }).confidence = 'verified';
    (p.sources as { retrieval: string }[])[0].retrieval = 'read';
  });
  assert.deepEqual(validateProfile(honest), []);

  // Une source lue mais de rang faible ne suffit pas : une photo n'est pas un
  // plan, et « je l'ai vu sur Street View » n'est pas un relevé de portillon.
  const weak = broken((p) => {
    (p as { confidence: string }).confidence = 'verified';
    (p.sources as { retrieval: string; tier: number }[])[0].retrieval = 'read';
    (p.sources as { retrieval: string; tier: number }[])[0].tier = 8;
  });
  assert.ok(codes(weak).includes('overclaimed'));
});

test('deux objets ne partagent jamais un identifiant', () => {
  const issues = codes(broken((p) => {
    (p.exits as { id: string }[])[0].id = 'gate.south';
  }));
  assert.ok(issues.includes('duplicateId'));
});

test('un niveau déclaré sous le quai est réellement dessous', () => {
  assert.ok(
    codes(broken((p) => { (p.levels as { floorY: number }[])[0].floorY = 5.075; })).includes('levelSign'),
  );
  // Et un espace où l'on marche a la hauteur libre d'un passage de gare.
  assert.ok(
    codes(broken((p) => {
      (p.levels as { headroom: number }[])[0].headroom = MIN_HEADROOM - 0.3;
    })).includes('headroom'),
  );
});

test('le `place` du profil s’accorde avec ses niveaux', () => {
  // Un second niveau au-dessus du quai, et la gare devient multiLevel : c'est
  // exactement le cas de Meguro, qui monte puis redescend.
  const issues = codes(broken((p) => {
    (p.levels as unknown[]).push({
      id: 'lvl.hall',
      relative: 'abovePlatform',
      floorY: 5.075,
      headroom: 3.1,
    });
  }));
  assert.ok(issues.includes('place'), `attendu place, reçu ${issues.join(', ')}`);
});

test('un accès mène à un hall qui existe, du bon côté du quai', () => {
  assert.ok(
    codes(broken((p) => {
      (p.platformAccesses as { toNodeId: string }[])[0].toNodeId = 'node.inexistant';
    })).includes('danglingNode'),
  );
  assert.ok(
    codes(broken((p) => {
      (p.platformAccesses as { rise: string }[])[0].rise = 'up';
    })).includes('riseSign'),
  );
});

test('l’accès principal existe et se prend', () => {
  assert.ok(
    codes(broken((p) => { (p as { primaryAccessId: string }).primaryAccessId = 'acc.fantôme'; }))
      .includes('primaryAccess'),
  );
  assert.ok(
    codes(broken((p) => {
      (p.platformAccesses as { depiction: string }[])[0].depiction = 'vista';
    })).includes('primaryAccess'),
  );
});

test('un hall tient dans l’emprise que le profil déclare au décor', () => {
  // C'est LA contrainte du chantier : au-delà de l'emprise, la nappe de rue
  // reprend sa place un mètre sous la dalle et couperait le hall en deux.
  const issues = codes(broken((p) => {
    (p.concourses as { rect: { x1: number } }[])[1].rect.x1 = 14;
  }));
  assert.ok(issues.includes('footprint'), `attendu footprint, reçu ${issues.join(', ')}`);
});

test('un couloir joint deux choses réelles, et son sens suit les altitudes', () => {
  const withStairs = (mutate: (p: StationConcourseProfile) => void) =>
    broken((p) => {
      (p.levels as unknown[]).push({
        id: 'lvl.hall',
        relative: 'abovePlatform',
        floorY: 5.075,
        headroom: 3.1,
      });
      (p as { place: string }).place = 'multiLevel';
      (p.concourses as unknown[]).push({
        id: 'node.upper',
        levelId: 'lvl.hall',
        kind: 'overbridge',
        fare: 'free',
        rect: { x0: 2.1, x1: 8.6, z0: 50, z1: 58 },
        depiction: 'walkable',
      });
      (p.corridors as unknown[]).push({
        id: 'link.up',
        kind: 'stairs',
        from: 'node.free',
        to: 'node.upper',
        rise: 1,
        rect: { x0: 3.0, x1: 5.4, z0: 46, z1: 52 },
        width: 2.4,
        depiction: 'walkable',
      });
      mutate(p);
    });

  // Sain d'abord : la branche montante ne doit rien rapporter.
  assert.deepEqual(validateProfile(withStairs(() => {})), []);
  // Un sens à l'envers se voit.
  assert.ok(
    codes(withStairs((p) => { (p.corridors as { rise: number }[])[0].rise = -1; }))
      .includes('riseSign'),
  );
  // Une « continuité franche » entre deux niveaux n'en est pas une.
  assert.ok(
    codes(withStairs((p) => {
      (p.corridors as { kind: string; rise: number }[])[0].kind = 'open';
      (p.corridors as { kind: string; rise: number }[])[0].rise = 0;
    })).includes('openRise'),
  );
  // Un couloir praticable plus étroit que le minimum.
  assert.ok(
    codes(withStairs((p) => {
      (p.corridors as { width: number }[])[0].width = MIN_BRANCH_WIDTH - 0.3;
    })).includes('width'),
  );
});

test('un groupe de portillons sépare une zone payante d’une zone libre', () => {
  assert.ok(codes(broken((p) => { (p as { gateGroups: unknown[] }).gateGroups = []; })).includes('noGate'));
  assert.ok(
    codes(broken((p) => { (p.concourses as { fare: string }[])[0].fare = 'free'; }))
      .includes('fareSide'),
  );
  assert.ok(
    codes(broken((p) => { (p.gateGroups as { passages: number }[])[0].passages = 0; }))
      .includes('passages'),
  );
  assert.ok(
    codes(broken((p) => { (p.gateGroups as { nameJp: string }[])[0].nameJp = ''; }))
      .includes('gateName'),
  );
});

test('une sortie part toujours d’une zone libre, et porte un nom', () => {
  assert.ok(
    codes(broken((p) => { (p.exits as { fromNodeId: string }[])[0].fromNodeId = 'node.paid'; }))
      .includes('fareSide'),
  );
  assert.ok(
    codes(broken((p) => { (p.exits as { nameEn: string }[])[0].nameEn = ''; }))
      .includes('exitName'),
  );
});

test('on ne nomme pas une enseigne qu’on n’a pas vérifiée', () => {
  // C'est la faute que tout ce format sert à empêcher : un konbini de
  // remplissage qui finit par s'appeler NEWDAYS sur un panneau.
  assert.ok(
    codes(broken((p) => { (p.commercialZones as { brand?: string }[])[0].brand = 'NEWDAYS'; }))
      .includes('unverifiedBrand'),
  );
  assert.ok(
    codes(broken((p) => { (p.commercialZones as { status: string }[])[0].status = 'gallery'; }))
      .includes('missingBrand'),
  );
  // Une façade ne se visite pas.
  assert.ok(
    codes(broken((p) => {
      const z = (p.commercialZones as { status: string; enterable: boolean }[])[0];
      z.status = 'facade';
      z.enterable = true;
    })).includes('facade'),
  );
  // Et un commerce se tient DANS son hall.
  assert.ok(
    codes(broken((p) => { (p.commercialZones as { rect: { z1: number } }[])[0].rect.z1 = 70; }))
      .includes('inside'),
  );
});

test('depuis l’accès principal, on atteint un contrôle puis une sortie', () => {
  // Le contrôle qui distingue une gare d'une collection de rectangles.
  const noGatePath = codes(broken((p) => {
    (p.gateGroups as { depiction: string }[])[0].depiction = 'closed';
  }));
  assert.ok(noGatePath.includes('unreachableGate'), noGatePath.join(', '));
  assert.ok(noGatePath.includes('unreachableExit'), noGatePath.join(', '));

  // Un hall praticable que rien ne relie au réseau se signale aussi : c'est le
  // « mur invisible » vu depuis les données.
  const orphan = codes(broken((p) => {
    (p.concourses as unknown[]).push({
      id: 'node.orphan',
      levelId: 'lvl.b1',
      kind: 'compact',
      fare: 'free',
      rect: { x0: 2.1, x1: 5.0, z0: 52, z1: 58 },
      depiction: 'walkable',
    });
  }));
  assert.ok(orphan.includes('orphanNode'), orphan.join(', '));
});

test('un hall seulement REPRÉSENTÉ ne casse pas le graphe', () => {
  // Tout le périmètre hors-jeu passe par là : une aile qu'on voit sans y aller
  // n'est pas un orphelin, c'est une perspective.
  const p = broken((q) => {
    (q.concourses as unknown[]).push({
      id: 'node.northWing',
      levelId: 'lvl.b1',
      kind: 'linear',
      fare: 'free',
      rect: { x0: 2.1, x1: 8.6, z0: 52, z1: 60 },
      depiction: 'vista',
    });
  });
  assert.deepEqual(validateProfile(p), []);
  assert.equal(isWalkable('vista'), false);
  assert.equal(isWalkable('walkable'), true);
});
