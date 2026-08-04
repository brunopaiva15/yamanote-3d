// Le trigramme de gare : QUI en a un, et OÙ il a le droit de s'afficher.
//
// JR East n'a pas attribué de trigramme à toute la boucle. Treize gares en
// portent un - les grandes correspondances et les têtes de réseau ; les
// dix-sept autres n'ont que leur numéro JY. La table `STATIONS` porte pourtant
// un `code` pour les trente, hérité d'un usage interne (repères audio, plaques
// de quai). Confondre les deux, c'est coiffer 鶯谷 d'un « UGD » qui n'existe
// nulle part dans la vraie gare.
//
// D'où deux garde-fous distincts :
//
//  1. la LISTE elle-même, épinglée gare par gare. Elle ne se déduit d'aucune
//     propriété de la table - ni des correspondances, ni du trafic : c'est un
//     relevé, et un relevé se relit, il ne se recalcule pas ;
//  2. le CHEMIN d'affichage. Le bandeau de l'afficheur de bord doit passer par
//     `stationCode()`, jamais par `station.code` : c'est la seule différence
//     entre les deux, et elle est invisible sur vingt-neuf lignes de diff.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STATIONS, stationCode } from '../src/data/stations.ts';

const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');

// Relevé : gare -> trigramme officiel. Toute gare absente n'en a pas.
const OFFICIAL: Record<string, string> = {
  JY01: 'TYO',
  JY02: 'KND',
  JY03: 'AKB',
  JY05: 'UEN',
  JY07: 'NPR',
  JY13: 'IKB',
  JY17: 'SJK',
  JY20: 'SBY',
  JY21: 'EBS',
  JY24: 'OSK',
  JY25: 'SGW',
  JY28: 'HMC',
  JY29: 'SMB',
};

test('treize gares portent un trigramme, les autres aucun', () => {
  assert.equal(Object.keys(OFFICIAL).length, 13);
  for (const st of STATIONS) {
    assert.equal(
      stationCode(st),
      OFFICIAL[st.jy] ?? '',
      `${st.jy} ${st.romaji} : trigramme affiché inattendu`,
    );
  }
});

test('les trigrammes officiels tiennent en trois majuscules', () => {
  for (const [jy, code] of Object.entries(OFFICIAL)) {
    assert.match(code, /^[A-Z]{3}$/, `${jy} : ${code}`);
  }
});

test('le relevé ne cite que des gares de la boucle', () => {
  const known = new Set(STATIONS.map((s) => s.jy));
  for (const jy of Object.keys(OFFICIAL)) assert.ok(known.has(jy), `${jy} inconnue`);
});

test('le trigramme officiel est bien celui de la table', () => {
  for (const st of STATIONS) {
    if (!OFFICIAL[st.jy]) continue;
    assert.equal(st.code, OFFICIAL[st.jy], `${st.jy} ${st.romaji}`);
  }
});

test("le bandeau de l'afficheur passe par stationCode(), pas par .code", () => {
  const src = readFileSync(resolvePath(ROOT, 'src/three/lineScreen.ts'), 'utf8');
  assert.match(src, /drawStationTile\(g, stationCode\(next\), next\.jy\)/);
  assert.doesNotMatch(src, /drawStationTile\([^)]*\.code/);
});
