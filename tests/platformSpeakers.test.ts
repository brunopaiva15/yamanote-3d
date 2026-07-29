// La sono du quai (data/stationGeometry.nearestSpeakers).
//
// Un quai est couvert par une LIGNE de diffuseurs, un tous les dix-neuf mètres,
// et le moteur audio n'en panne qu'une poignée à la fois : ceux qui sont autour
// de la tête. Deux choses doivent être vraies de ce choix, et ce sont elles qui
// font qu'on entend l'annonce partout pareil.
//
//   • On est toujours ENCADRÉ, jamais dépassé : où qu'on se tienne sur le quai,
//     la sélection tient des deux côtés de la tête (sauf aux abouts, où il n'y
//     a plus rien à prendre d'un côté).
//   • Le relais est NEUTRE : quand on marche, le diffuseur qui entre dans la
//     sélection remplace exactement celui qui en sort, à la même distance. Sans
//     cela, chaque changement ferait un saut de niveau au milieu d'une phrase.

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./fixtures/ts-resolve.mjs', import.meta.url);

const { nearestSpeakers } = await import('../src/data/stationGeometry.ts');

/** La ligne d'un quai de 224 m, telle que systems/stationPlacement la pose. */
const LINE = (() => {
  const zs: number[] = [];
  for (let z = -109 + 4.1; z <= 109; z += 19) zs.push(z);
  return zs;
})();

/** Nombre de prises du moteur audio (audioEngine.PLATFORM_TAPS). */
const TAPS = 6;

const pick = (ear: number, count = TAPS): number[] => {
  const out: number[] = [];
  const n = nearestSpeakers(LINE, ear, count, out);
  return out.slice(0, n);
};

test('la sélection prend bien les plus proches', () => {
  for (let ear = -110; ear <= 110; ear += 0.5) {
    const got = pick(ear);
    const want = [...LINE]
      .sort((a, b) => Math.abs(a - ear) - Math.abs(b - ear))
      .slice(0, TAPS)
      .sort((a, b) => a - b);
    assert.deepEqual([...got].sort((a, b) => a - b), want, `à z = ${ear}`);
  }
});

test('la tête reste encadrée sur toute la longueur du quai', () => {
  // Aux abouts il n'y a plus rien à prendre d'un côté : la ligne s'arrête au
  // premier diffuseur, et c'est le plus proche qui porte.
  const first = LINE[0];
  const last = LINE[LINE.length - 1];
  for (let ear = first; ear <= last; ear += 0.5) {
    const got = pick(ear);
    assert.ok(
      got.some((z) => z <= ear),
      `aucun diffuseur en deçà de z = ${ear}`,
    );
    assert.ok(
      got.some((z) => z >= ear),
      `aucun diffuseur au-delà de z = ${ear}`,
    );
  }
});

test('aucun diffuseur ne sert deux prises', () => {
  for (let ear = -110; ear <= 110; ear += 0.5) {
    const got = pick(ear);
    assert.equal(new Set(got).size, got.length, `doublon à z = ${ear}`);
  }
});

test('le relais se fait à distance égale : pas de saut de niveau', () => {
  // On marche le long du quai en relevant chaque changement de sélection. À
  // chacun, l'entrant et le sortant doivent être à la même distance de la tête
  // — c'est la condition pour que l'échange soit inaudible.
  let prev = pick(-100);
  let relays = 0;
  for (let ear = -100; ear <= 100; ear += 0.05) {
    const got = pick(ear);
    const gone = prev.filter((z) => !got.includes(z));
    const come = got.filter((z) => !prev.includes(z));
    if (gone.length) {
      relays++;
      assert.equal(gone.length, 1, `plus d'un diffuseur relayé à la fois (z = ${ear})`);
      assert.equal(come.length, 1);
      // Un pas de 5 cm : les deux distances ne sont égales qu'à ce pas près.
      const dGone = Math.abs(gone[0] - ear);
      const dCome = Math.abs(come[0] - ear);
      assert.ok(
        Math.abs(dGone - dCome) < 0.1,
        `relais déséquilibré à z = ${ear} : ${dGone.toFixed(2)} m contre ${dCome.toFixed(2)} m`,
      );
    }
    prev = got;
  }
  // Et le relais a bien lieu : la fenêtre glisse d'un cran par diffuseur
  // dépassé, jusqu'à buter sur le bout de la ligne.
  assert.equal(relays, LINE.length - TAPS);
});

test('un quai plus court que le nombre de prises n’en remplit que ce qu’il peut', () => {
  const out: number[] = [];
  const n = nearestSpeakers([-19, 0, 19], 3, TAPS, out);
  assert.equal(n, 3);
  assert.deepEqual(out.slice(0, n), [0, 19, -19]);
});
