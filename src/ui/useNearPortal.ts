// Proximité d'un seuil de porte dégagé, sondée à 200 ms.
//
// L'information vit dans runtime et change à 60 images par seconde ; le HUD,
// lui, n'a besoin que de savoir si l'invite doit être là — même idiome que
// useEmergencyStop.

import { useEffect, useState } from 'react';
import { runtime } from '../systems/runtime';
import { nearestOpenPortal } from '../systems/walkable';

export function useNearPortal(): boolean {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const id = window.setInterval(() => {
      setNear(nearestOpenPortal(runtime.playerX, runtime.playerZ) !== null);
    }, 200);
    return () => window.clearInterval(id);
  }, []);
  return near;
}
