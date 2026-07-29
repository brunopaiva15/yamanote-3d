// Invite contextuelle « descendre / monter » — et son refus.
//
// Le franchissement n'a pas besoin d'elle : le seuil ouvert EST le passage, on
// marche à travers la porte. L'invite ne fait qu'annoncer que c'est possible —
// et donne le raccourci à ceux qui préfèrent ne pas viser.
//
// L'autre versant : les quarante baies de porte qui s'ouvrent devant les dix
// voitures qu'on ne peut pas visiter. La limite rouge y est déjà dressée dans
// la baie (three/station/Barrier) ; ici on en donne la raison, sans quoi elle
// ressemblerait à un bug.
//
// Sondée à 200 ms comme l'arrêt d'urgence : la proximité d'un seuil vit dans
// runtime, jamais dans React, et surtout pas à 60 images par seconde.

import { CONSIST, PLAYER_CAR } from '../data/e235';
import { useStore } from '../store';
import { useT } from '../i18n';
import { useNearPortal } from './useNearPortal';
import { useTalkTarget } from './useTalkTarget';
import { useWrongDoor } from './useWrongDoor';

export function BoardingPrompt() {
  const started = useStore((s) => s.started);
  const seated = useStore((s) => s.seated);
  const onPlatform = useStore((s) => s.onPlatform);
  const touch = useStore((s) => s.touch);
  const t = useT();
  const near = useNearPortal();
  const talk = useTalkTarget();
  const wrong = useWrongDoor();

  if (!started || seated) return null;

  // Le refus passe avant tout le reste, tactile compris : il n'a pas de bouton
  // qui le doublerait, et on est en train de pousser cette porte-là.
  if (wrong) {
    return (
      <div className="hud-prompt hud-prompt--deny">
        {t.hud.wrongDoor.replace('{car}', String(CONSIST[PLAYER_CAR].no))}
      </div>
    );
  }

  // Un voyageur en joue prime sur le seuil : les deux invites se disputent le
  // même bout d'écran, et on vise plus précisément quelqu'un qu'une porte.
  if (touch || !near || talk) return null;

  // Pas de touche : la porte ouverte EST le passage, on marche à travers.
  // L'invite ne fait qu'annoncer que c'est possible.
  return <div className="hud-prompt">{onPlatform ? t.hud.boardTrain : t.hud.alight}</div>;
}
