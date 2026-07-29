// Le refus devant une porte qui n'est pas la sienne.
//
// Le franchissement, lui, se passe de mots : le seuil ouvert EST le passage, on
// marche à travers la porte. Rien à annoncer, donc rien à afficher.
//
// Reste l'autre versant : les quarante baies de porte qui s'ouvrent devant les
// dix voitures qu'on ne peut pas visiter. La limite rouge y est déjà dressée
// dans la baie (three/station/Barrier) ; ici on en donne la raison, sans quoi
// elle ressemblerait à un bug.
//
// Sondé à 200 ms comme l'arrêt d'urgence : la limite vit dans runtime, jamais
// dans React, et surtout pas à 60 images par seconde.

import { CONSIST, PLAYER_CAR } from '../data/e235';
import { useStore } from '../store';
import { useT } from '../i18n';
import { useWrongDoor } from './useWrongDoor';

export function BoardingPrompt() {
  const started = useStore((s) => s.started);
  const seated = useStore((s) => s.seated);
  const t = useT();
  const wrong = useWrongDoor();

  if (!started || seated || !wrong) return null;

  // Le refus s'affiche même en tactile : il n'a pas de bouton qui le
  // doublerait, et on est en train de pousser cette porte-là.
  return (
    <div className="hud-prompt hud-prompt--deny">
      {t.hud.wrongDoor.replace('{car}', String(CONSIST[PLAYER_CAR].no))}
    </div>
  );
}
