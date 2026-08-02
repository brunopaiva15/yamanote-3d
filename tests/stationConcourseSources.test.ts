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

test('chaque gare porte son plan officiel JR East', () => {
  for (let i = 0; i < STATION_COUNT; i++) {
    const name = `${STATIONS[i].jy} ${STATIONS[i].romaji}`;
    const { sources } = sourcesFor(i);
    assert.ok(sources.length > 0, `${name} : aucune source`);
    // La première source est toujours de rang 1 : une gare ne s'appuie pas
    // d'abord sur une photo.
    assert.equal(sources[0].tier, 1, `${name} : la première source n’est pas officielle`);
    // Et la page de plan de CETTE gare est là, quelque part.
    const page = sources.find((s) => s.url === jrEastPlanUrl(i));
    assert.ok(page, `${name} : page de plan absente`);
    assert.equal(page.publisher, 'JR East', name);
    // Le titre porte le nom japonais de la gare : c'est cette concordance
    // titre ↔ adresse qui a servi de confirmation, faute de pouvoir lire la page.
    assert.ok(page.title.includes(STATIONS[i].kanji), `${name} : titre sans le nom de la gare`);
    assert.equal(page.consultedAt, REFERENCE_DATE, name);
  }
});

test('un plan LU passe devant la page seulement indexée', () => {
  // L'ordre des sources est celui de la preuve, pas celui de la découverte :
  // ce qu'on a ouvert prime sur ce qu'on a seulement trouvé.
  for (let i = 0; i < STATION_COUNT; i++) {
    const { sources } = sourcesFor(i);
    const lastRead = sources.map((s) => s.retrieval).lastIndexOf('read');
    const firstIndexed = sources.map((s) => s.retrieval).indexOf('indexed');
    if (lastRead >= 0 && firstIndexed >= 0) {
      assert.ok(
        lastRead < firstIndexed,
        `${STATIONS[i].romaji} : une source lue est rangée après une source non lue`,
      );
    }
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
  const read = readSourceCount();
  assert.ok(
    doc.includes(`**Plans officiels ouverts et lus : ${read} / 30.**`),
    `le registre compte ${read} plan(s) lu(s) ; le carnet de relevé annonce autre chose `
      + '— relancer `npm run docs:concourse`',
  );
});

test('une gare dont le plan est lu porte un relevé, et pas « à relever »', () => {
  // L'inverse serait le pire des deux mondes : une source ouverte, et une fiche
  // qui continue de dire qu'on ne sait rien.
  const doc = readFileSync(new URL('../docs/STATION_CONCOURSE_EVIDENCE.md', import.meta.url), 'utf8');
  const sections = doc.split(/^## (?=JY)/m).slice(1);
  for (let i = 0; i < STATION_COUNT; i++) {
    const { sources } = sourcesFor(i);
    if (!sources.some((s) => s.retrieval === 'read')) continue;
    const s = STATIONS[i];
    const section = sections.find((sec) => sec.startsWith(`${s.jy} ${s.romaji}`));
    assert.ok(section, `${s.jy} : fiche introuvable`);
    // On cherche le GABARIT, pas les mots. Une fiche relevée a parfaitement le
    // droit d'écrire « le côté Marunouchi reste à relever » : c'est même
    // exactement ce qu'on lui demande de dire. Ce qu'on interdit, c'est la
    // mention automatique laissée en place alors que le plan est ouvert.
    for (const placeholder of [
      '*à relever — le plan officiel',
      'tout ce qui précède : le plan officiel',
      '**à établir**',
      '*décidé en phase 5*',
    ]) {
      assert.ok(
        !section.includes(placeholder),
        `${s.jy} ${s.romaji} : plan lu, mais la fiche garde le gabarit « ${placeholder} »`,
      );
    }
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
