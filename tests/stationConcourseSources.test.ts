// Le registre des sources (src/data/stationConcourseSources).
//
// Il n'y a rien à « tester » dans une liste d'adresses, sauf deux choses, et ce
// sont les deux qui se dégradent en silence : que la table reste alignée sur
// les trente gares, et que la DOCUMENTATION ne se mette pas à raconter autre
// chose que le code. Le second contrôle est le plus utile des deux - le jour où
// quelqu'un ouvrira réellement les plans officiels et passera une référence en
// `read`, le carnet de relevé cessera d'être vrai, et rien d'autre ne le
// remarquerait.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CONCOURSE_SOURCES,
  jrEastPlanUrl,
  jrEastPlanUrlEn,
  readSourceCount,
  sourcesFor,
  REFERENCE_DATE,
} from '../src/data/stationConcourseSources.ts';
import { STATION_COUNT } from '../src/data/loop.ts';
import { STATIONS } from '../src/data/stations.ts';

test('les trente gares ont leur jeu de sources, dans l’ordre', () => {
  assert.equal(CONCOURSE_SOURCES.length, STATION_COUNT);
  for (let i = 0; i < STATION_COUNT; i++) {
    assert.equal(CONCOURSE_SOURCES[i].stationIndex, i);
    assert.equal(sourcesFor(i), CONCOURSE_SOURCES[i]);
  }
  // La boucle n'a pas de terminus : l'index se replie, comme partout ailleurs.
  assert.equal(sourcesFor(30), CONCOURSE_SOURCES[0]);
  assert.equal(sourcesFor(-1), CONCOURSE_SOURCES[29]);
});

test('chaque gare part de son plan officiel JR East', () => {
  for (let i = 0; i < STATION_COUNT; i++) {
    const name = `${STATIONS[i].jy} ${STATIONS[i].romaji}`;
    const first = sourcesFor(i).sources[0];
    assert.ok(first, `${name} : aucune source`);
    assert.equal(first.tier, 1, `${name} : la première source n’est pas JR East`);
    assert.equal(first.publisher, 'JR East', name);
    // Le titre porte le nom japonais de la gare : c'est cette concordance
    // titre ↔ adresse qui a servi de confirmation, faute de pouvoir lire la page.
    assert.ok(first.title.includes(STATIONS[i].kanji), `${name} : titre sans le nom de la gare`);
    assert.equal(first.url, jrEastPlanUrl(i), name);
    assert.equal(first.consultedAt, REFERENCE_DATE, name);
  }
});

test('les trente numéros internes JR East sont distincts', () => {
  // Ils n'ont aucun rapport avec le code JY - Akihabara est 41, Tokyo 1039 -
  // et deux gares qui partageraient un numéro pointeraient sur le même plan.
  const seen = new Set<string>();
  for (let i = 0; i < STATION_COUNT; i++) {
    const url = jrEastPlanUrl(i);
    assert.ok(!seen.has(url), `${STATIONS[i].romaji} : adresse de plan en double (${url})`);
    seen.add(url);
    assert.match(url, /^https:\/\/www\.jreast\.co\.jp\/estation\/stations\/\d+\.html$/);
  }
  assert.equal(seen.size, STATION_COUNT);
});

test('la version anglaise est le MÊME document, à un segment près', () => {
  for (let i = 0; i < STATION_COUNT; i++) {
    assert.equal(jrEastPlanUrlEn(i), jrEastPlanUrl(i).replace('/estation/', '/en/estation/'));
  }
});

test('le carnet de relevé dit la vérité sur ce qui a été lu', () => {
  // LE CONTRÔLE QUI COMPTE. `docs/STATION_CONCOURSE_EVIDENCE.md` s'ouvre sur un
  // avertissement : aucun plan officiel n'a été ouvert, parce que la passerelle
  // réseau de cet environnement refuse la connexion aux sites des opérateurs.
  // C'est vrai aujourd'hui ; ce ne le sera plus le jour où quelqu'un lira les
  // plans. Ce test lie les deux : passer une source en `read` sans toucher au
  // carnet fait tomber la suite, et c'est exactement ce qu'on veut - une
  // documentation qui ment sur sa méthode est pire que pas de documentation.
  const doc = readFileSync(new URL('../docs/STATION_CONCOURSE_EVIDENCE.md', import.meta.url), 'utf8');
  const claimsNothingRead = doc.includes('**Aucun plan officiel n’a été ouvert.**')
    || doc.includes("**Aucun plan officiel n'a été ouvert.**");
  const read = readSourceCount();
  if (read === 0) {
    assert.ok(
      claimsNothingRead,
      'aucune source n’est lue, mais le carnet de relevé ne le dit pas',
    );
  } else {
    assert.ok(
      !claimsNothingRead,
      `${read} source(s) désormais lue(s) : l’avertissement du carnet de relevé est à retirer`,
    );
  }
});

test('le carnet de relevé porte une fiche par gare', () => {
  const doc = readFileSync(new URL('../docs/STATION_CONCOURSE_EVIDENCE.md', import.meta.url), 'utf8');
  for (let i = 0; i < STATION_COUNT; i++) {
    const s = STATIONS[i];
    assert.ok(
      doc.includes(`## ${s.jy} ${s.romaji} — ${s.kanji}`),
      `${s.jy} ${s.romaji} : pas de fiche dans le carnet de relevé`,
    );
    // Et la fiche cite bien l'adresse du plan de CETTE gare.
    assert.ok(doc.includes(jrEastPlanUrl(i)), `${s.jy} : adresse de plan absente du carnet`);
  }
});
