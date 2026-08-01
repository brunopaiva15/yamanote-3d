// Y a-t-il quelqu'un en face de moi ? Sondé à 150 ms.
//
// Même idiome que useWrongDoor : la visée vit dans systems/conversation et
// change à 60 images par seconde ; l'invite, elle, n'a besoin que de savoir
// si elle doit être là.

import { useEffect, useState } from 'react';
import { conversation, talkTarget } from '../systems/conversation';
import { prompt } from '../systems/interaction';

export function useTalkTarget(): boolean {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const id = window.setInterval(() => {
      // Un appareil en face passe devant : la touche est unique
      // (systems/interaction), et deux invites sous le même réticule diraient
      // deux choses dont une seule serait vraie.
      setNear(talkTarget.target !== null && !conversation.active && prompt.key === null);
    }, 150);
    return () => window.clearInterval(id);
  }, []);
  return near;
}
