// La bulle de dialogue, accrochée à la tête de celui qui parle.
//
// Un sous-titre en bas de l'écran aurait été plus simple, mais dans une rame
// où trente personnes sont à portée, il faut voir QUI parle : la bulle suit
// la tête, image par image, y compris quand la rame tangue ou que le quai
// défile sous le voyageur.
//
// Le texte, lui, ne change qu'à chaque réplique : React n'est réveillé que
// sur `conversation.revision`, jamais à 60 fps.

import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type * as THREE from 'three';
import { conversation } from '../systems/conversation';

interface View {
  text: string;
  revision: number;
  unsolicited: boolean;
}

export function PaxSpeechBubble() {
  const group = useRef<THREE.Group>(null);
  const [view, setView] = useState<View>({ text: '', revision: -1, unsolicited: false });

  useFrame(() => {
    const g = group.current;
    if (g && conversation.active) {
      // Un peu au-dessus de la tête, jamais dedans.
      g.position.set(conversation.x, conversation.y + 0.26, conversation.z);
    }
    if (conversation.revision !== view.revision) {
      setView({
        text: conversation.active ? conversation.text : '',
        revision: conversation.revision,
        unsolicited: conversation.unsolicited,
      });
    }
  });

  return (
    <group ref={group}>
      {view.text.length > 0 && (
        <Html center zIndexRange={[14, 10]} style={{ pointerEvents: 'none' }}>
          <div
            key={view.revision}
            className={`pax-bubble${view.unsolicited ? ' pax-bubble-aside' : ''}`}
          >
            {view.text}
          </div>
        </Html>
      )}
    </group>
  );
}
