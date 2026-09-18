// Revenir au menu, depuis n'importe laquelle des deux versions.
//
// Le bouton vit dans le HUD, donc dans les deux expériences. Ce module est
// l'endroit unique où l'on défait ce que `prepareGame` et le trajet ont mis
// en route : le graphe audio (qui continuerait de rouler sans boucle
// d'images), la boucle sonore, le salon, les sous-titres, le verrou de
// pointeur. Le store, lui, ne fait que reposer `started` - App démonte alors
// Game ou AudioGame, et leurs effets de sortie achèvent le ménage.
//
// Rien de three.js ici : le HUD est aussi celui de la version sonore.

import { applyThemeColor } from '../i18n/documentMeta';
import { useStore } from '../store';
import { stopAudio } from './audioEngine';
import { stopAudioLoop } from './audioLoop';
import { input } from './input';
import { resetChat } from './net/chat';
import { leaveRoom } from './net/room';
import { beginRenderBoot } from './renderBoot';
import { resetRenderHealth } from './renderHealth';
import { resetRuntime } from './runtime';
import { cancelSpeech } from './speech';
import { resetSubtitles } from './subtitles';

export function returnToMenu(): void {
  if (!useStore.getState().started) return;
  input.keys.clear();
  input.joy.x = 0;
  input.joy.y = 0;
  if (typeof document !== 'undefined' && document.pointerLockElement) {
    document.exitPointerLock();
  }
  leaveRoom();
  // D'abord démonter le trajet : sinon réinitialiser le rendu (génération,
  // voile d'attente) ferait disparaître la toile sous un HUD encore monté,
  // un écran noir d'une frame, ou le carton de chargement par-dessus le menu.
  useStore.getState().stop();
  stopAudioLoop();
  stopAudio();
  cancelSpeech();
  resetSubtitles();
  resetChat();
  applyThemeColor(null);
  resetRuntime();
  beginRenderBoot();
  resetRenderHealth();
}
