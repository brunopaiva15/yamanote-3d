// Invite contextuelle « descendre / monter ».
//
// Le franchissement n'a pas besoin d'elle : le seuil ouvert EST le passage, on
// marche à travers la porte. L'invite ne fait qu'annoncer que c'est possible —
// et donne le raccourci à ceux qui préfèrent ne pas viser.
//
// Sondée à 200 ms comme l'arrêt d'urgence : la proximité d'un seuil vit dans
// runtime, jamais dans React, et surtout pas à 60 images par seconde.

import { useStore } from '../store';
import { useT } from '../i18n';
import { useNearPortal } from './useNearPortal';

export function BoardingPrompt() {
  const started = useStore((s) => s.started);
  const seated = useStore((s) => s.seated);
  const onPlatform = useStore((s) => s.onPlatform);
  const touch = useStore((s) => s.touch);
  const t = useT();
  const near = useNearPortal();

  if (!started || seated || touch || !near) return null;

  // Pas de touche : la porte ouverte EST le passage, on marche à travers.
  // L'invite ne fait qu'annoncer que c'est possible.
  return <div className="hud-prompt">{onPlatform ? t.hud.boardTrain : t.hud.alight}</div>;
}
