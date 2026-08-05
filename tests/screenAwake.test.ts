// Le verrou d'écran (src/systems/wakeLock.ts).
//
// Le défaut de départ tenait en une phrase : sur iPhone, l'écran se verrouille
// au bout de trente secondes pendant qu'on regarde la ligne défiler sans rien
// toucher. La 3D disparaît, et sur la version sonore le contexte audio est
// suspendu avec l'écran - la ligne se tait.
//
// Demander le jeton est une ligne de code. Ce qui se casse en silence, et ce
// que ce fichier tient, est ailleurs :
//
//   • le système REPREND le jeton dès que la page passe en arrière-plan et ne
//     le rend jamais tout seul. Sans redemande au retour, le verrou ne survit
//     pas au premier coup d'œil à une notification ;
//   • la demande est asynchrone : deux `wake` concurrents laisseraient deux
//     jetons, et un `sleep` exprimé pendant qu'une demande est en vol doit
//     tout de même rendre le jeton qui arrive - sinon l'écran reste allumé
//     après le retour au menu, ce qui est un défaut de batterie invisible ;
//   • un navigateur qui refuse (API absente, iframe, politique) ne doit ni
//     lever, ni bloquer les demandes suivantes.

import test from 'node:test';
import assert from 'node:assert/strict';

import { ScreenAwake, type ScreenLock, type WakeLockHost } from '../src/systems/wakeLock.ts';

/** Un navigateur de laboratoire, avec son journal et ses interrupteurs. */
function host(options: { supported?: boolean; visible?: boolean } = {}) {
  const log: string[] = [];
  const listeners: Array<() => void> = [];
  let refuse = false;
  /** Demandes en attente, pour pouvoir les résoudre à la main. */
  const pending: Array<() => void> = [];
  let holdRequests = false;
  let onRequest: (() => void) | null = null;

  const state = {
    supported: options.supported ?? true,
    visible: options.visible ?? true,
    /** Nombre de jetons vivants : c'est LA valeur qui ne doit jamais dépasser 1. */
    live: 0,
  };

  const makeLock = (): ScreenLock => {
    state.live++;
    log.push('request');
    return {
      release: async () => {
        state.live--;
        log.push('release');
      },
      addEventListener: (_type, listener) => listeners.push(listener),
    };
  };

  const api: WakeLockHost = {
    supported: () => state.supported,
    visible: () => state.visible,
    request: () => {
      if (refuse) return Promise.reject(new Error('refusé'));
      if (!holdRequests) return Promise.resolve(makeLock());
      return new Promise<ScreenLock>((resolve) => {
        pending.push(() => resolve(makeLock()));
        onRequest?.();
        onRequest = null;
      });
    },
  };

  return {
    api,
    log,
    state,
    /** Le système reprend le jeton, comme au passage en arrière-plan. */
    systemTakesBack: () => {
      state.live--;
      log.push('taken');
      for (const listener of listeners.splice(0)) listener();
    },
    refuseNext: (on: boolean) => {
      refuse = on;
    },
    holdRequests: (on: boolean) => {
      holdRequests = on;
    },
    settlePending: () => {
      for (const resolve of pending.splice(0)) resolve();
    },
    /** Attend qu'une demande soit RÉELLEMENT partie chez le navigateur. */
    whenRequested: () =>
      new Promise<void>((resolve) => {
        if (pending.length) resolve();
        else onRequest = resolve;
      }),
  };
}

test('on embarque : un jeton, et un seul, même si on le demande deux fois', async () => {
  const h = host();
  const awake = new ScreenAwake(h.api);

  await awake.wake();
  assert.equal(awake.held, true);
  assert.equal(h.state.live, 1);

  await awake.wake();
  assert.equal(h.state.live, 1, 'le navigateur n’en compte qu’un par document');
  assert.deepEqual(h.log, ['request']);
});

test('on redescend : le jeton est rendu, la minuterie du système reprend', async () => {
  const h = host();
  const awake = new ScreenAwake(h.api);

  await awake.wake();
  await awake.sleep();
  assert.equal(awake.held, false);
  assert.equal(h.state.live, 0);
  assert.deepEqual(h.log, ['request', 'release']);

  // Rendre deux fois ne rend pas deux fois.
  await awake.sleep();
  assert.deepEqual(h.log, ['request', 'release']);
});

test('le système reprend le jeton en arrière-plan : on le redemande au retour', async () => {
  const h = host();
  const awake = new ScreenAwake(h.api);

  await awake.wake();
  // La page passe en arrière-plan : le navigateur reprend son jeton.
  h.state.visible = false;
  h.systemTakesBack();
  assert.equal(awake.held, false, 'le jeton est perdu, et il ne reviendra pas tout seul');

  // Une redemande faite masquée serait refusée : on ne la fait pas.
  await awake.refresh();
  assert.equal(h.state.live, 0);
  assert.deepEqual(h.log, ['request', 'taken']);

  // Retour sur la page : c'est là, et seulement là, qu'on redemande.
  h.state.visible = true;
  await awake.refresh();
  assert.equal(awake.held, true);
  assert.equal(h.state.live, 1);
  assert.deepEqual(h.log, ['request', 'taken', 'request']);
});

test('un retour au menu pendant que la demande est en vol ne laisse pas de jeton orphelin', async () => {
  const h = host();
  const awake = new ScreenAwake(h.api);

  h.holdRequests(true);
  const waking = awake.wake();
  await h.whenRequested();
  // Le joueur ressort AVANT que le navigateur ait répondu.
  const sleeping = awake.sleep();
  h.settlePending();
  await waking;
  await sleeping;

  assert.equal(awake.held, false);
  assert.equal(h.state.live, 0, 'le jeton arrivé après coup est rendu, pas oublié');
  assert.deepEqual(h.log, ['request', 'release']);
});

test('un navigateur sans l’API, ou qui refuse, ne casse rien et ne bloque pas la suite', async () => {
  const absent = host({ supported: false });
  const awake = new ScreenAwake(absent.api);
  await awake.wake();
  assert.equal(awake.held, false);
  assert.deepEqual(absent.log, [], 'rien n’est même tenté');

  const h = host();
  const other = new ScreenAwake(h.api);
  h.refuseNext(true);
  await other.wake();
  assert.equal(other.held, false, 'le refus est avalé : le joueur n’a rien à réparer');

  // Et la file reste vivante : la demande suivante passe.
  h.refuseNext(false);
  await other.refresh();
  assert.equal(other.held, true);
});

test('rien n’est demandé tant que la page n’est pas regardée', async () => {
  const h = host({ visible: false });
  const awake = new ScreenAwake(h.api);
  await awake.wake();
  assert.equal(awake.held, false);
  assert.deepEqual(h.log, []);
});
