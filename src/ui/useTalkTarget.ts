// Y a-t-il quelqu'un en face de moi ? Sondé à 150 ms.
//
// Même idiome que useNearPortal : la visée vit dans systems/conversation et
// change à 60 images par seconde ; l'invite, elle, n'a besoin que de savoir
// si elle doit être là.

import { useEffect, useState } from 'react';
import { conversation, talkTarget } from '../systems/conversation';

export function useTalkTarget(): boolean {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const id = window.setInterval(() => {
      setNear(talkTarget.target !== null && !conversation.active);
    }, 150);
    return () => window.clearInterval(id);
  }, []);
  return near;
}
