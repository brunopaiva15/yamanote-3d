// Le joueur est-il devant une porte par laquelle il ne peut pas monter ?
//
// Sondé à 200 ms comme la proximité d'un seuil : la limite vit dans runtime et
// s'allume à 60 images par seconde ; le HUD, lui, n'a besoin que de savoir si
// la phrase doit être là.

import { useEffect, useState } from 'react';
import { wrongDoor } from '../systems/wrongDoor';

/**
 * La limite rouge affleure dès qu'on tourne la tête vers la baie - c'est bien,
 * elle est faite pour ça. La phrase, elle, ne doit pas clignoter au passage :
 * elle n'arrive qu'une fois la limite franchement allumée, et ne s'en va qu'en
 * redescendant nettement plus bas.
 */
const SHOW_AT = 0.55;
const HIDE_AT = 0.25;

export function useWrongDoor(): boolean {
  const [denied, setDenied] = useState(false);
  useEffect(() => {
    const id = window.setInterval(() => {
      const wrong = wrongDoor();
      setDenied((was) => (wrong ? wrong.strength > (was ? HIDE_AT : SHOW_AT) : false));
    }, 200);
    return () => window.clearInterval(id);
  }, []);
  return denied;
}
