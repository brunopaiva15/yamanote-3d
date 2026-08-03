// LE DOCUMENT DE PORTÉE NE DOIT PAS MENTIR (docs/STATION_CONCOURSE_SCOPE.md).
//
// Un tableau écrit à la main dans un fichier Markdown dérive le jour même où le
// code change : c'est la leçon des tables générées de ce chantier — l'évidence
// et la table d'emprise sont produites par un script et tenues par un test,
// exprès. Le document de portée, lui, se lit ; il ne se génère pas. On vérifie
// donc ce qui compte : que sa LISTE DE GARES soit celle du code, et que son
// compte de gares branchées soit le bon.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';

register('./fixtures/ts-resolve.mjs', import.meta.url);

const { deferredIndices, wiredIndices } =
  await import('../src/data/stationConcourseWired.ts');
const { STATIONS } = await import('../src/data/stations.ts');
const { STATION_COUNT } = await import('../src/data/loop.ts');
const { CONCOURSE_PROFILES } = await import('../src/data/stationConcourseProfiles.ts');

const DOC = readFileSync(new URL('../docs/STATION_CONCOURSE_SCOPE.md', import.meta.url), 'utf8');
const ROWS = DOC.split('\n')
  .filter((l) => /^\| JY\d\d \|/.test(l))
  .map((l) => l.split('|').map((c) => c.trim()));

test('le tableau de portée couvre les trente gares, dans l’ordre', () => {
  assert.equal(ROWS.length, STATION_COUNT);
  ROWS.forEach((r, i) => {
    assert.equal(r[1], STATIONS[i].jy, `ligne ${i}`);
    assert.equal(r[2], STATIONS[i].romaji, `ligne ${i}`);
  });
});

test('il dit la vérité sur ce qui est branché', () => {
  const wired = new Set(wiredIndices());
  const deferred = new Set(deferredIndices());
  ROWS.forEach((r, i) => {
    const want = wired.has(i) ? 'oui' : deferred.has(i) ? 'différée' : 'non';
    assert.equal(r[4], want, `${STATIONS[i].jy} ${STATIONS[i].romaji}`);
  });
  // Et le compte écrit en toutes lettres dans le texte, qui est ce qu'on lit
  // vraiment quand on ouvre le document.
  assert.equal(wired.size, 26);
  assert.ok(
    DOC.includes('Vingt-six gares sur trente passent par leur relevé'),
    'le compte écrit ne correspond plus',
  );
});

test('chaque question ouverte du relevé est reportée', () => {
  // Cent questions notées gare par gare au moment de la lecture des plans. Le
  // document les recopie toutes : une question qu'on cesse de reporter est une
  // approximation qui redevient invisible.
  const listed = DOC.split('\n').filter((l) => l.startsWith('- **JY')).length;
  const asked = CONCOURSE_PROFILES.reduce(
    (n, p) => n + (p.openQuestions?.length ?? 0),
    0,
  );
  assert.equal(listed, asked, `${listed} reportées pour ${asked} posées`);
});
