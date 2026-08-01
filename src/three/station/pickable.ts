// Inscrire un objet de la scène au registre de visée.
//
// Fichier à part, et c'est voulu : ce n'est ni un composant ni de la géométrie,
// c'est le petit pont entre le graphe React et `systems/pick`. Le mettre avec
// les pièces de mobilier obligerait chaque module qui n'a besoin que du pont à
// charger aussi les pièces.

import { useLayoutEffect, useRef } from 'react';
import type * as THREE from 'three';
import { addPickable, type PickAction } from '../../systems/pick';

/**
 * Inscrit un objet au registre de visée, et l'en retire au démontage.
 *
 * L'action est recomposée quand ses VALEURS changent, pas à chaque image :
 * `JSON.stringify` est ici la façon la plus courte de former cette clé de
 * dépendance sans mentir sur ce dont l'effet dépend.
 */
export function usePickable<T extends THREE.Object3D>(act: PickAction) {
  const ref = useRef<T>(null);
  const key = JSON.stringify(act);
  useLayoutEffect(() => {
    if (!ref.current) return;
    return addPickable(ref.current, JSON.parse(key) as PickAction);
  }, [key]);
  return ref;
}
