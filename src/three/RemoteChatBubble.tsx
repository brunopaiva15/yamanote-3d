// Ce que disent les autres, au-dessus de leur tête.
//
// Calqué sur `three/PaxSpeechBubble`, et volontairement : un message de joueur
// et une réplique de PNJ sont deux paroles dans la même rame, et les afficher
// de deux façons différentes ferait de l'un un élément d'interface et de
// l'autre un élément de monde. Ici, les deux sont du monde.
//
// La différence tient en un mot dans la classe - de quoi teinter le liseré, pas
// de quoi changer la forme.
//
// Comme la bulle des PNJ, celle-ci vit dans un `<group>` qu'on déplace à chaque
// image et dont le CONTENU ne change qu'à chaque réplique : React n'est réveillé
// que sur un nouveau message, jamais à soixante hertz. Sans ça, un salon de huit
// personnes ferait huit re-rendus par image.

import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type * as THREE from 'three';
import { bubbleFor } from '../systems/net/chat';
import { peers } from '../systems/net/peers';
import { peerWorldPose } from '../systems/net/pose';
import { ROOM_CAPACITY } from '../systems/net/protocol';

/** Hauteur de la bulle au-dessus de l'œil (m). Un peu au-dessus, jamais dedans. */
const AU_DESSUS = 0.34;

interface Vue {
  id: string;
  name: string;
  text: string;
}

export function RemoteChatBubble() {
  const groupes = useRef<(THREE.Group | null)[]>([]);
  const [vues, setVues] = useState<Vue[]>([]);

  useFrame(() => {
    const now = Date.now();
    const liste = [...peers.values()].sort(
      (a, b) => a.joinedAt - b.joinedAt || (a.id < b.id ? -1 : 1),
    );

    const prochaines: Vue[] = [];
    for (let i = 0; i < ROOM_CAPACITY; i++) {
      const pair = liste[i];
      const groupe = groupes.current[i];
      if (!pair || !groupe) {
        if (groupe) groupe.visible = false;
        continue;
      }
      const texte = bubbleFor(pair.id, now);
      const pose = texte ? peerWorldPose(pair.id, now) : null;
      if (!texte || !pose) {
        groupe.visible = false;
        continue;
      }
      groupe.visible = true;
      groupe.position.set(pose.x, pose.y + AU_DESSUS, pose.z);
      prochaines.push({ id: pair.id, name: pair.name, text: texte });
    }

    // On ne réveille React que si le TEXTE affiché change. Comparer les chaînes
    // coûte quelques microsecondes ; un re-rendu de huit bulles en coûte mille.
    setVues((avant) => {
      if (avant.length !== prochaines.length) return prochaines;
      for (let i = 0; i < avant.length; i++) {
        if (avant[i].id !== prochaines[i].id || avant[i].text !== prochaines[i].text) {
          return prochaines;
        }
      }
      return avant;
    });
  });

  return (
    <>
      {Array.from({ length: ROOM_CAPACITY }, (_, i) => (
        <group
          key={i}
          ref={(g) => {
            groupes.current[i] = g;
          }}
        >
          {vues[i] && (
            <Html center zIndexRange={[14, 10]} style={{ pointerEvents: 'none' }}>
              <div className="pax-bubble pax-bubble-remote" key={vues[i].text}>
                {vues[i].name && <span className="pax-bubble-who">{vues[i].name}</span>}
                {vues[i].text}
              </div>
            </Html>
          )}
        </group>
      ))}
    </>
  );
}
