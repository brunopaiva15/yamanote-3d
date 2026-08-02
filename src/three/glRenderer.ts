// La fabrique du renderer WebGL.
//
// react-three-fiber sait construire le sien tout seul à partir d'un objet
// d'options, et c'est ce qu'on lui laissait faire. Le problème n'est pas la
// construction, c'est l'ÉCHEC de la construction : il a lieu dans une fonction
// `async` que la bibliothèque n'attend pas, et un contexte refusé s'y perd en
// promesse non gérée. On passe donc une fabrique, pour tenir l'exception nous-
// mêmes et pouvoir en faire quelque chose (systems/renderHealth).
//
// Au passage, on écoute `webglcontextcreationerror` : c'est le seul endroit où
// le navigateur explique POURQUOI il refuse, et il faut l'écouter avant que le
// contexte ne soit demandé.

import { WebGLRenderer } from 'three';
import { contextAttemptOptions, reportRenderFailure } from '../systems/renderHealth';

export function createWebglRenderer(
  props: { canvas: HTMLCanvasElement },
  attempt: number,
): WebGLRenderer {
  const { canvas } = props;
  let statusMessage: string | null = null;
  const onCreationError = (e: Event) => {
    statusMessage = (e as WebGLContextEvent).statusMessage || null;
  };
  canvas.addEventListener('webglcontextcreationerror', onCreationError, false);
  try {
    return new WebGLRenderer({
      canvas,
      alpha: true,
      ...contextAttemptOptions(attempt),
    });
  } catch (e) {
    reportRenderFailure(statusMessage ?? (e instanceof Error ? e.message : String(e)));
    throw e;
  } finally {
    canvas.removeEventListener('webglcontextcreationerror', onCreationError, false);
  }
}
