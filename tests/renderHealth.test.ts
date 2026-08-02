// La reprise d'une toile qui n'a pas démarré (src/systems/renderHealth.ts).
//
// Le cas réel : sur téléphone, le navigateur refuse parfois le contexte WebGL
// au moment de monter à bord - mémoire déjà prise, processus graphique occupé.
// react-three-fiber créant son renderer dans une promesse qu'il n'attend pas,
// l'exception se perdait, la scène n'était jamais rendue et la boucle d'images
// ne démarrait pas. Le HUD, lui, est monté À CÔTÉ de la toile : il s'affichait
// parfaitement sur l'état préparé par prepareGame, et n'en bougeait plus.
// Écran noir, gare et température bien lisibles, rien qui avance, et rien
// d'autre à faire que recharger la page à la main.
//
// Ce que ces tests tiennent :
//   · un refus est RATTRAPÉ, en silence, tant qu'il reste des tentatives ;
//   · on ne remonte pas indéfiniment : au bout du compte le joueur est prévenu ;
//   · une image dessinée efface l'ardoise - sans quoi le chien de garde de
//     Game.tsx finissait par remonter une toile en parfait état de marche.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_RENDER_ATTEMPTS,
  contextAttemptOptions,
  markRenderAlive,
  remountRenderer,
  reportRenderFailure,
  retryRenderer,
  useRenderHealth,
} from '../src/systems/renderHealth.ts';

function reset(): void {
  useRenderHealth.setState({
    status: 'ok',
    alive: false,
    generation: 0,
    attempts: 1,
    reason: null,
  });
}

test('un refus passager est rattrapé sans rien dire au joueur', () => {
  reset();
  reportRenderFailure('Error creating WebGL context.');
  assert.equal(useRenderHealth.getState().status, 'retrying');

  remountRenderer();
  const after = useRenderHealth.getState();
  assert.equal(after.status, 'ok');
  // La toile est neuve : c'est la seule façon de redemander un contexte à un
  // navigateur qui vient d'en refuser un.
  assert.equal(after.generation, 1);
  assert.equal(after.alive, false);

  markRenderAlive();
  const alive = useRenderHealth.getState();
  assert.equal(alive.status, 'ok');
  assert.equal(alive.alive, true);
  assert.equal(alive.attempts, 1, 'l’ardoise est effacée : le prochain refus repart de zéro');
  assert.equal(alive.reason, null);
});

test('on ne remonte pas la toile indéfiniment : le joueur finit par être prévenu', () => {
  reset();
  for (let i = 0; i < MAX_RENDER_ATTEMPTS - 1; i++) {
    reportRenderFailure('refus');
    assert.equal(
      useRenderHealth.getState().status,
      'retrying',
      `tentative ${i + 2} : on retente encore`,
    );
    remountRenderer();
  }
  reportRenderFailure('refus');
  const end = useRenderHealth.getState();
  assert.equal(end.status, 'failed');
  assert.equal(end.reason, 'refus', 'le message du navigateur survit pour le rapport de bug');
});

test('un même échec signalé deux fois ne consomme qu’une tentative', () => {
  reset();
  // L'exception de three ET le chien de garde peuvent décrire le même refus.
  reportRenderFailure('exception');
  reportRenderFailure(null);
  reportRenderFailure(null);
  assert.equal(useRenderHealth.getState().attempts, 2);
  assert.equal(useRenderHealth.getState().reason, 'exception');
});

test('« Réessayer » rend au joueur toutes ses tentatives', () => {
  reset();
  useRenderHealth.setState({ status: 'failed', attempts: MAX_RENDER_ATTEMPTS + 1, reason: 'x' });
  retryRenderer();
  const s = useRenderHealth.getState();
  assert.equal(s.status, 'ok');
  assert.equal(s.attempts, 1);
  assert.equal(s.reason, null);
  assert.equal(s.generation, 1, 'toile neuve, comme pour une reprise automatique');
});

test('chaque reprise demande MOINS que la précédente', () => {
  const first = contextAttemptOptions(1);
  assert.equal(first.antialias, true);
  assert.equal(first.powerPreference, 'high-performance');
  // Le multi-échantillonnage et la carte rapide sont exactement ce qu'un
  // navigateur à court de mémoire refuse en premier : des bords un peu durs
  // valent mieux qu'un écran noir.
  for (const attempt of [2, 3, 4]) {
    const next = contextAttemptOptions(attempt);
    assert.equal(next.antialias, false);
    assert.equal(next.powerPreference, 'default');
  }
});

test('markRenderAlive ne touche à rien quand tout va bien', () => {
  reset();
  markRenderAlive();
  const settled = useRenderHealth.getState();
  markRenderAlive();
  // Appelée à chaque image : elle doit rendre le MÊME objet, sinon React
  // re-rendrait soixante fois par seconde.
  assert.equal(useRenderHealth.getState(), settled);
});
